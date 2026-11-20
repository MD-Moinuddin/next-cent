import uuid

from sqlalchemy import func, select

from nextcent_api.clock import utcnow
from nextcent_api.models import RecurringRule, Tag, Transaction, User, transaction_tags
from tests.helpers import seed_transaction


async def test_get_me_defaults(client_a):
    r = await client_a.get("/v1/me")
    assert r.status_code == 200
    body = r.json()
    assert body["home_currency"] == "USD"
    assert body["opening_balance_minor"] is None
    assert body["monthly_income_minor"] is None
    assert body["onboarding_completed"] is False


async def test_me_requires_auth(anon_client):
    assert (await anon_client.get("/v1/me")).status_code == 401


async def test_patch_sets_profile_balance_and_income(client_a, db_session):
    r = await client_a.patch(
        "/v1/me",
        json={
            "home_currency": "eur",
            "opening_balance_minor": 125000,
            "monthly_income_minor": 240000,
            "onboarding_completed": True,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["home_currency"] == "EUR"
    assert body["opening_balance_minor"] == 125000
    assert body["monthly_income_minor"] == 240000
    assert body["onboarding_completed"] is True

    ob = await db_session.scalar(select(Transaction).where(Transaction.kind == "opening_balance"))
    assert ob.currency == "EUR" and ob.amount_minor == 125000
    assert ob.occurred_on == utcnow().date()
    rule = await db_session.scalar(select(RecurringRule))
    assert (
        rule.system_key == "monthly_income" and rule.cadence == "monthly" and rule.kind == "income"
    )
    assert rule.next_due_on.day == 1 and rule.next_due_on > utcnow().date()


async def test_patch_twice_updates_in_place(client_a, db_session):
    await client_a.patch("/v1/me", json={"opening_balance_minor": 1000})
    await client_a.patch("/v1/me", json={"opening_balance_minor": 2000})
    count = await db_session.scalar(
        select(func.count()).select_from(Transaction).where(Transaction.kind == "opening_balance")
    )
    ob = await db_session.scalar(select(Transaction).where(Transaction.kind == "opening_balance"))
    assert count == 1 and ob.amount_minor == 2000 and ob.version == 2


async def test_clear_and_restore_monthly_income(client_a, db_session):
    await client_a.patch("/v1/me", json={"monthly_income_minor": 5000})
    cleared = await client_a.patch("/v1/me", json={"monthly_income_minor": None})
    assert cleared.json()["monthly_income_minor"] is None
    again = await client_a.patch("/v1/me", json={"monthly_income_minor": 7000})
    assert again.json()["monthly_income_minor"] == 7000
    assert await db_session.scalar(select(func.count()).select_from(RecurringRule)) == 1


async def test_currency_locked_once_transactions_exist(client_a, db_session):
    me = (await client_a.get("/v1/me")).json()
    await seed_transaction(db_session, uuid.UUID(me["id"]))
    r = await client_a.patch("/v1/me", json={"home_currency": "EUR"})
    assert r.status_code == 409 and r.json()["code"] == "currency_locked"
    same = await client_a.patch("/v1/me", json={"home_currency": "USD"})
    assert same.status_code == 200


async def test_currency_change_updates_opening_balance(client_a, db_session):
    await client_a.patch("/v1/me", json={"opening_balance_minor": 1000})
    await client_a.patch("/v1/me", json={"home_currency": "GBP"})
    ob = await db_session.scalar(select(Transaction).where(Transaction.kind == "opening_balance"))
    assert ob.currency == "GBP"


async def test_patch_rejects_negative_float_and_unknown_fields(client_a):
    for bad in (
        {"opening_balance_minor": -1},
        {"opening_balance_minor": 10.5},
        {"home_currency": "XXX"},
        {"monthly_income_minor": 0},
        {"nope": 1},
    ):
        r = await client_a.patch("/v1/me", json=bad)
        assert r.status_code == 422, bad


async def test_delete_me_removes_only_own_data(client_a, client_b, db_session):
    a = (await client_a.get("/v1/me")).json()
    b = (await client_b.get("/v1/me")).json()
    await seed_transaction(db_session, uuid.UUID(a["id"]))
    await seed_transaction(db_session, uuid.UUID(b["id"]))
    for client in (client_a, client_b):  # a tagged transaction and a recurring rule each
        cat = (await client.get("/v1/categories")).json()[0]["id"]
        tagged = {"kind": "expense", "amount_minor": 100, "currency": "EUR",
                  "occurred_on": "2026-11-01", "category_id": cat,
                  "tags": ["trip", "food"]}  # fmt: skip
        assert (
            await client.put(f"/v1/transactions/{uuid.uuid4()}", json=tagged)
        ).status_code == 201
        rule = {"kind": "expense", "amount_minor": 100, "currency": "EUR", "category_id": cat,
                "cadence": "monthly", "anchor_on": utcnow().date().isoformat()}  # fmt: skip
        assert (await client.post("/v1/recurring", json=rule)).status_code == 201
    r = await client_a.delete("/v1/me")
    assert r.status_code == 204
    assert await db_session.scalar(select(func.count()).select_from(User)) == 1
    b_id = uuid.UUID(b["id"])
    remaining = (await db_session.scalars(select(Transaction))).all()
    assert {t.user_id for t in remaining} == {b_id} and len(remaining) == 2
    rules = (await db_session.scalars(select(RecurringRule.user_id))).all()
    assert rules == [b_id]
    tags = (await db_session.execute(select(Tag.user_id, Tag.name).order_by(Tag.name))).all()
    assert [tuple(t) for t in tags] == [(b_id, "food"), (b_id, "trip")]
    links = (
        await db_session.execute(
            select(Transaction.user_id).join(
                transaction_tags, transaction_tags.c.transaction_id == Transaction.id
            )
        )
    ).all()
    assert [row[0] for row in links] == [b_id, b_id]
    orphans = await db_session.scalar(
        select(func.count())
        .select_from(transaction_tags)
        .where(transaction_tags.c.transaction_id.not_in(select(Transaction.id)))
    )
    assert orphans == 0
