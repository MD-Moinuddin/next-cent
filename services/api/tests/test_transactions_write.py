import asyncio
import uuid

import pytest
from sqlalchemy import func, select

from nextcent_api.models import Tag, Transaction


def payload(category_id, **over):
    base = {
        "kind": "expense", "amount_minor": 1450, "currency": "EUR", "occurred_on": "2026-11-17",
        "category_id": str(category_id) if category_id else None, "merchant": "Lidl", "note": None,
        "tags": [],
    }  # fmt: skip
    base.update(over)
    return base


async def a_category(client) -> str:
    return (await client.get("/v1/categories")).json()[0]["id"]


async def test_create_returns_201_version_1(client_a):
    cat, tx_id = await a_category(client_a), uuid.uuid4()
    r = await client_a.put(f"/v1/transactions/{tx_id}", json=payload(cat))
    assert r.status_code == 201
    body = r.json()
    assert body["id"] == str(tx_id) and body["version"] == 1 and body["amount_minor"] == 1450
    assert body["deleted_at"] is None and body["tags"] == []


async def test_identical_retry_is_idempotent(client_a, db_session):
    cat, tx_id = await a_category(client_a), uuid.uuid4()
    await client_a.put(f"/v1/transactions/{tx_id}", json=payload(cat))
    again = await client_a.put(f"/v1/transactions/{tx_id}", json=payload(cat))
    assert again.status_code == 200 and again.json()["version"] == 1
    assert await db_session.scalar(select(func.count()).select_from(Transaction)) == 1


async def test_update_with_current_base_version(client_a):
    cat, tx_id = await a_category(client_a), uuid.uuid4()
    await client_a.put(f"/v1/transactions/{tx_id}", json=payload(cat))
    r = await client_a.put(
        f"/v1/transactions/{tx_id}", json=payload(cat, merchant="Aldi", base_version=1)
    )
    assert r.status_code == 200 and r.json()["version"] == 2 and r.json()["merchant"] == "Aldi"


async def test_stale_update_conflicts_but_replay_is_idempotent(client_a):
    cat, tx_id = await a_category(client_a), uuid.uuid4()
    await client_a.put(f"/v1/transactions/{tx_id}", json=payload(cat))
    update = payload(cat, merchant="Aldi", base_version=1)
    await client_a.put(f"/v1/transactions/{tx_id}", json=update)
    replay = await client_a.put(f"/v1/transactions/{tx_id}", json=update)
    assert replay.status_code == 200 and replay.json()["version"] == 2
    stale = await client_a.put(
        f"/v1/transactions/{tx_id}", json=payload(cat, merchant="Other", base_version=1)
    )
    assert stale.status_code == 409
    assert stale.json()["code"] == "version_conflict" and stale.json()["current_version"] == 2


async def test_create_with_different_content_for_existing_id_conflicts(client_a):
    cat, tx_id = await a_category(client_a), uuid.uuid4()
    await client_a.put(f"/v1/transactions/{tx_id}", json=payload(cat))
    r = await client_a.put(f"/v1/transactions/{tx_id}", json=payload(cat, amount_minor=999))
    assert r.status_code == 409


async def test_other_users_id_is_404_and_untouched(client_a, client_b, db_session):
    cat, tx_id = await a_category(client_a), uuid.uuid4()
    await client_a.put(f"/v1/transactions/{tx_id}", json=payload(cat, tags=["keep"]))
    before = await db_session.get(Transaction, tx_id)
    snapshot = (before.version, before.updated_at, before.merchant, before.deleted_at)
    cat_b = await a_category(client_b)
    r = await client_b.put(f"/v1/transactions/{tx_id}", json=payload(cat_b, merchant="Evil"))
    missing = await client_b.put(
        f"/v1/transactions/{uuid.uuid4()}", json=payload(cat_b, merchant="Evil", base_version=1)
    )
    assert r.status_code == 404 and r.json()["code"] == "transaction_not_found"
    assert r.json() == missing.json()  # no leak: identical to a missing id
    d = await client_b.delete(f"/v1/transactions/{tx_id}")
    d_missing = await client_b.delete(f"/v1/transactions/{uuid.uuid4()}")
    assert d.status_code == 404 and d.json() == d_missing.json()
    assert (await client_b.post(f"/v1/transactions/{tx_id}/restore")).status_code == 404
    await db_session.refresh(before)
    assert (before.version, before.updated_at, before.merchant, before.deleted_at) == snapshot
    assert [t.name for t in before.tags] == ["keep"]


@pytest.mark.parametrize(
    ("over", "field"),
    [
        pytest.param({"amount_minor": 0}, "amount_minor", id="amount-zero"),
        pytest.param({"amount_minor": -1}, "amount_minor", id="amount-negative"),
        pytest.param({"amount_minor": 14.5}, "amount_minor", id="amount-float"),
        pytest.param({"amount_minor": 1450.0}, "amount_minor", id="amount-integral-float"),
        pytest.param({"currency": "XXX"}, "currency", id="unknown-currency"),
        pytest.param({"kind": "opening_balance"}, "kind", id="opening-balance-kind"),
        pytest.param({"occurred_on": "1999-01-01"}, "occurred_on", id="date-too-old"),
        pytest.param({"tags": ["x" * 31]}, "tags", id="tag-too-long"),
        pytest.param({"tags": [f"t{i}" for i in range(21)]}, "tags", id="too-many-tags"),
        pytest.param({"tags": [""]}, "tags", id="empty-tag"),
        pytest.param({"tags": ["   "]}, "tags", id="whitespace-tag"),
        pytest.param({"base_version": 0}, "base_version", id="base-version-zero"),
        pytest.param({"base_version": "abc"}, "base_version", id="base-version-not-int"),
        pytest.param({"nope": 1}, "nope", id="extra-field"),
        pytest.param({"category_id": None}, "body", id="expense-without-category"),
    ],
)
async def test_validation_rules(client_a, over, field):
    cat = await a_category(client_a)
    body = {**payload(cat), **over}
    r = await client_a.put(f"/v1/transactions/{uuid.uuid4()}", json=body)
    assert r.status_code == 422, r.text
    assert r.json()["code"] == "validation_error"
    assert any(field in e["loc"] for e in r.json()["errors"]), r.json()["errors"]


async def test_unknown_category_id_is_invalid_category(client_a):
    nonexistent = str(uuid.uuid4())
    r = await client_a.put(f"/v1/transactions/{uuid.uuid4()}", json=payload(nonexistent))
    assert r.status_code == 422 and r.json()["code"] == "invalid_category"


async def test_other_users_category_is_rejected(client_a, client_b):
    cat_a = await a_category(client_a)
    await client_b.get("/v1/me")
    r = await client_b.put(f"/v1/transactions/{uuid.uuid4()}", json=payload(cat_a))
    assert r.status_code == 422 and r.json()["code"] == "invalid_category"


async def test_income_needs_no_category(client_a):
    r = await client_a.put(
        f"/v1/transactions/{uuid.uuid4()}",
        json=payload(None, kind="income", merchant="Salary", amount_minor=240000),
    )
    assert r.status_code == 201


async def test_tags_are_deduplicated_case_insensitively_and_reused(client_a, db_session):
    cat = await a_category(client_a)
    r = await client_a.put(
        f"/v1/transactions/{uuid.uuid4()}", json=payload(cat, tags=["Weekly", "weekly", "  fun "])
    )
    assert r.json()["tags"] == ["Weekly", "fun"]
    await client_a.put(f"/v1/transactions/{uuid.uuid4()}", json=payload(cat, tags=["WEEKLY"]))
    assert await db_session.scalar(select(func.count()).select_from(Tag)) == 2


async def test_archived_category_cannot_be_used_for_new_transactions(client_a):
    cat = await a_category(client_a)
    await client_a.patch(f"/v1/categories/{cat}", json={"archived": True})
    r = await client_a.put(f"/v1/transactions/{uuid.uuid4()}", json=payload(cat))
    assert r.status_code == 422 and r.json()["code"] == "category_archived"


async def test_delete_restore_lifecycle(client_a, db_session):
    cat, tx_id = await a_category(client_a), uuid.uuid4()
    await client_a.put(f"/v1/transactions/{tx_id}", json=payload(cat))
    assert (await client_a.delete(f"/v1/transactions/{tx_id}")).status_code == 204
    tx = await db_session.get(Transaction, tx_id)
    await db_session.refresh(tx)
    assert tx.deleted_at is not None and tx.version == 2
    assert (await client_a.delete(f"/v1/transactions/{tx_id}")).status_code == 204
    await db_session.refresh(tx)
    assert tx.version == 2  # idempotent delete
    blocked = await client_a.put(
        f"/v1/transactions/{tx_id}", json=payload(cat, merchant="X", base_version=2)
    )
    assert blocked.status_code == 409 and blocked.json()["code"] == "transaction_deleted"
    restored = await client_a.post(f"/v1/transactions/{tx_id}/restore")
    assert restored.status_code == 200
    assert restored.json()["deleted_at"] is None and restored.json()["version"] == 3


async def test_concurrent_identical_creates_yield_one_row(client_a, db_session):
    cat, tx_id = await a_category(client_a), uuid.uuid4()
    body = payload(cat, tags=["race"])
    results = await asyncio.gather(
        *(client_a.put(f"/v1/transactions/{tx_id}", json=body) for _ in range(2))
    )
    assert sorted(r.status_code for r in results) == [200, 201]
    assert {r.json()["version"] for r in results} == {1}
    assert await db_session.scalar(select(func.count()).select_from(Transaction)) == 1


async def test_concurrent_different_creates_conflict_cleanly(client_a, db_session):
    cat, tx_id = await a_category(client_a), uuid.uuid4()
    results = await asyncio.gather(
        client_a.put(f"/v1/transactions/{tx_id}", json=payload(cat, merchant="One")),
        client_a.put(f"/v1/transactions/{tx_id}", json=payload(cat, merchant="Two")),
    )
    assert sorted(r.status_code for r in results) == [201, 409]
    loser = next(r for r in results if r.status_code == 409)
    assert loser.json()["code"] == "version_conflict" and loser.json()["current_version"] == 1
    assert await db_session.scalar(select(func.count()).select_from(Transaction)) == 1


async def test_concurrent_new_tag_in_different_transactions(client_a, db_session):
    cat = await a_category(client_a)
    results = await asyncio.gather(
        *(
            client_a.put(f"/v1/transactions/{uuid.uuid4()}", json=payload(cat, tags=tags))
            for tags in (
                ["Shared", "alpha"],
                ["shared", "beta"],
                ["SHARED"],
                ["beta", "alpha", "Shared"],
            )
        )
    )
    assert [r.status_code for r in results] == [201] * 4
    names = (await db_session.scalars(select(Tag.name))).all()
    assert len({n.lower() for n in names}) == len(names) == 3


async def test_create_with_base_version_is_404(client_a):
    cat = await a_category(client_a)
    r = await client_a.put(f"/v1/transactions/{uuid.uuid4()}", json=payload(cat, base_version=1))
    assert r.status_code == 404 and r.json()["code"] == "transaction_not_found"


async def test_delete_and_restore_of_missing_id_are_404(client_a):
    for call in (client_a.delete, client_a.post):
        url = f"/v1/transactions/{uuid.uuid4()}" + ("/restore" if call == client_a.post else "")
        r = await call(url)
        assert r.status_code == 404 and r.json()["code"] == "transaction_not_found"


async def test_restore_of_not_deleted_row_is_noop(client_a):
    cat, tx_id = await a_category(client_a), uuid.uuid4()
    await client_a.put(f"/v1/transactions/{tx_id}", json=payload(cat))
    r = await client_a.post(f"/v1/transactions/{tx_id}/restore")
    assert r.status_code == 200 and r.json()["version"] == 1 and r.json()["deleted_at"] is None


async def test_update_replaces_and_clears_tags(client_a):
    cat, tx_id = await a_category(client_a), uuid.uuid4()
    await client_a.put(f"/v1/transactions/{tx_id}", json=payload(cat, tags=["a", "b"]))
    r = await client_a.put(
        f"/v1/transactions/{tx_id}", json=payload(cat, tags=["b", "c"], base_version=1)
    )
    assert r.status_code == 200 and r.json()["tags"] == ["b", "c"] and r.json()["version"] == 2
    r = await client_a.put(f"/v1/transactions/{tx_id}", json=payload(cat, tags=[], base_version=2))
    assert r.status_code == 200 and r.json()["tags"] == [] and r.json()["version"] == 3


async def test_update_category_rules(client_a, client_b):
    cats = (await client_a.get("/v1/categories")).json()
    old, other = cats[0]["id"], cats[1]["id"]
    tx_id = uuid.uuid4()
    await client_a.put(f"/v1/transactions/{tx_id}", json=payload(old))
    await client_a.patch(f"/v1/categories/{old}", json={"archived": True})
    await client_a.patch(f"/v1/categories/{other}", json={"archived": True})
    # unchanged archived category is allowed on update
    ok = await client_a.put(
        f"/v1/transactions/{tx_id}", json=payload(old, merchant="Aldi", base_version=1)
    )
    assert ok.status_code == 200 and ok.json()["version"] == 2
    # changing TO an archived category is not
    r = await client_a.put(f"/v1/transactions/{tx_id}", json=payload(other, base_version=2))
    assert r.status_code == 422 and r.json()["code"] == "category_archived"
    # another user's category is not
    foreign = await a_category(client_b)
    r = await client_a.put(f"/v1/transactions/{tx_id}", json=payload(foreign, base_version=2))
    assert r.status_code == 422 and r.json()["code"] == "invalid_category"


async def _seed_opening_balance(client, db_session):
    await client.patch("/v1/me", json={"opening_balance_minor": 5000})
    ob = await db_session.scalar(select(Transaction).where(Transaction.kind == "opening_balance"))
    assert ob is not None
    return ob


async def test_opening_balance_is_invisible_to_transaction_writes(client_a, db_session):
    ob = await _seed_opening_balance(client_a, db_session)
    cat = await a_category(client_a)
    snapshot = (ob.kind, ob.amount_minor, ob.version, ob.deleted_at, ob.merchant)
    url = f"/v1/transactions/{ob.id}"
    responses = [
        await client_a.put(url, json=payload(cat, base_version=ob.version)),
        await client_a.put(url, json=payload(None, kind="income", base_version=ob.version)),
        await client_a.put(url, json=payload(cat)),
        await client_a.delete(url),
        await client_a.post(f"{url}/restore"),
    ]
    for r in responses:
        assert r.status_code == 404 and r.json()["code"] == "transaction_not_found"
    await db_session.refresh(ob)
    assert (ob.kind, ob.amount_minor, ob.version, ob.deleted_at, ob.merchant) == snapshot


async def test_concurrent_mixed_case_tags_do_not_deadlock(client_a, db_session):
    cat = await a_category(client_a)
    variants = [
        ["Zeta", "alpha"], ["zeta", "alpha"], ["ALPHA", "Zeta"], ["alpha", "ZETA", "Mid"],
        ["mid", "Alpha", "zeta"], ["Mid", "beta", "Zeta"], ["BETA", "alpha"], ["Beta", "Mid"],
    ]  # fmt: skip
    results = await asyncio.gather(
        *(
            client_a.put(f"/v1/transactions/{uuid.uuid4()}", json=payload(cat, tags=tags))
            for tags in variants * 2
        )
    )
    assert [r.status_code for r in results] == [201] * len(variants) * 2
    names = (await db_session.scalars(select(Tag.name))).all()
    assert sorted(n.lower() for n in names) == ["alpha", "beta", "mid", "zeta"]
