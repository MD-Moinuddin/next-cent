import uuid
from datetime import date, timedelta

from nextcent_api.clock import utcnow
from nextcent_api.models import Transaction
from nextcent_api.pagination import encode_cursor
from tests.helpers import first_category_id, seed_transaction


async def provision(client) -> uuid.UUID:
    return uuid.UUID((await client.get("/v1/me")).json()["id"])


def make(user_id, cat, i, **kw):
    return Transaction(
        id=uuid.uuid4(), user_id=user_id, kind=kw.pop("kind", "expense"), amount_minor=100 + i,
        currency="EUR", occurred_on=date(2026, 1, 1) + timedelta(days=i % 30),
        category_id=cat, merchant=kw.pop("merchant", f"shop {i}"), **kw,
    )  # fmt: skip


async def test_browse_paginates_without_gaps_or_duplicates(client_a, db_session):
    uid = await provision(client_a)
    cat = await first_category_id(db_session, uid)
    db_session.add_all(make(uid, cat, i) for i in range(120))
    await db_session.commit()
    seen, cursor = [], None
    for _ in range(10):
        url = "/v1/transactions?limit=50" + (f"&cursor={cursor}" if cursor else "")
        page = (await client_a.get(url)).json()
        seen += page["items"]
        cursor = page["next_cursor"]
        if not cursor:
            break
    ids = [t["id"] for t in seen]
    assert len(ids) == len(set(ids)) == 120
    dates = [t["occurred_on"] for t in seen]
    assert dates == sorted(dates, reverse=True)


async def test_browse_filters(client_a, db_session):
    uid = await provision(client_a)
    cats = (await client_a.get("/v1/categories")).json()
    c1, c2 = uuid.UUID(cats[0]["id"]), uuid.UUID(cats[1]["id"])
    db_session.add_all(
        [
            make(uid, c1, 1, merchant="Lidl"),
            make(uid, c2, 2, merchant="Bus"),
            make(uid, None, 3, kind="income", merchant="Salary"),
            make(uid, c1, 4, merchant="Deleted", deleted_at=utcnow()),
        ]
    )
    await db_session.commit()
    by_cat = (await client_a.get(f"/v1/transactions?category_id={c1}")).json()["items"]
    assert [t["merchant"] for t in by_cat] == ["Lidl"]
    income = (await client_a.get("/v1/transactions?kind=income")).json()["items"]
    assert [t["merchant"] for t in income] == ["Salary"]
    ranged = (await client_a.get("/v1/transactions?from=2026-01-04&to=2026-01-04")).json()["items"]
    assert [t["merchant"] for t in ranged] == ["Salary"]
    all_items = (await client_a.get("/v1/transactions")).json()["items"]
    assert "Deleted" not in [t["merchant"] for t in all_items]


async def test_search_matches_merchant_note_tags_and_escapes_wildcards(client_a, db_session):
    await provision(client_a)
    cat = (await client_a.get("/v1/categories")).json()[0]["id"]
    body = lambda **o: {  # noqa: E731
        "kind": "expense", "amount_minor": 100, "currency": "EUR", "occurred_on": "2026-11-01",
        "category_id": cat, "merchant": None, "note": None, "tags": [], **o,
    }  # fmt: skip
    await client_a.put(f"/v1/transactions/{uuid.uuid4()}", json=body(merchant="Blue Bottle"))
    await client_a.put(f"/v1/transactions/{uuid.uuid4()}", json=body(note="birthday gift"))
    await client_a.put(f"/v1/transactions/{uuid.uuid4()}", json=body(tags=["commute"]))
    await client_a.put(f"/v1/transactions/{uuid.uuid4()}", json=body(merchant="100% juice"))
    assert len((await client_a.get("/v1/transactions?q=bottle")).json()["items"]) == 1
    assert len((await client_a.get("/v1/transactions?q=BIRTHDAY")).json()["items"]) == 1
    assert len((await client_a.get("/v1/transactions?q=commute")).json()["items"]) == 1
    assert len((await client_a.get("/v1/transactions?q=%25")).json()["items"]) == 1  # literal %


async def test_browse_is_scoped_to_the_user(client_a, client_b, db_session):
    uid_a = await provision(client_a)
    await provision(client_b)
    cat = await first_category_id(db_session, uid_a)
    db_session.add(make(uid_a, cat, 1))
    await db_session.commit()
    assert (await client_b.get("/v1/transactions")).json()["items"] == []


async def test_invalid_cursor_is_400(client_a):
    r = await client_a.get("/v1/transactions?cursor=garbage")
    assert r.status_code == 400 and r.json()["code"] == "invalid_cursor"


async def test_get_single_transaction_and_isolation(client_a, client_b):
    cat = (await client_a.get("/v1/categories")).json()[0]["id"]
    tx_id = uuid.uuid4()
    await client_a.put(
        f"/v1/transactions/{tx_id}",
        json={
            "kind": "expense",
            "amount_minor": 5,
            "currency": "EUR",
            "occurred_on": "2026-11-01",
            "category_id": cat,
        },
    )
    assert (await client_a.get(f"/v1/transactions/{tx_id}")).status_code == 200
    await client_b.get("/v1/me")
    assert (await client_b.get(f"/v1/transactions/{tx_id}")).status_code == 404


async def test_changes_feed_includes_deleted_in_update_order_and_paginates(client_a):
    cat = (await client_a.get("/v1/categories")).json()[0]["id"]
    ids = [uuid.uuid4() for _ in range(3)]
    for i, tx_id in enumerate(ids):
        await client_a.put(
            f"/v1/transactions/{tx_id}",
            json={"kind": "expense", "amount_minor": 10 + i, "currency": "EUR",
                  "occurred_on": "2026-11-01", "category_id": cat},
        )  # fmt: skip
    await client_a.delete(f"/v1/transactions/{ids[0]}")
    collected, cursor = [], None
    while True:
        url = "/v1/transactions/changes?since=2000-01-01T00:00:00Z&limit=1"
        if cursor:
            url += f"&cursor={cursor}"
        page = (await client_a.get(url)).json()
        collected += page["items"]
        cursor = page["next_cursor"]
        if not cursor:
            break
    assert [t["id"] for t in collected] == [str(ids[1]), str(ids[2]), str(ids[0])]
    assert collected[-1]["deleted_at"] is not None
    updated = [t["updated_at"] for t in collected]
    assert updated == sorted(updated)


async def test_tags_list(client_a):
    cat = (await client_a.get("/v1/categories")).json()[0]["id"]
    await client_a.put(
        f"/v1/transactions/{uuid.uuid4()}",
        json={"kind": "expense", "amount_minor": 5, "currency": "EUR", "occurred_on": "2026-11-01",
              "category_id": cat, "tags": ["b", "a"]},
    )  # fmt: skip
    assert [t["name"] for t in (await client_a.get("/v1/tags")).json()] == ["a", "b"]


BODY = {"kind": "expense", "amount_minor": 5, "currency": "EUR", "occurred_on": "2026-11-01"}


async def test_limit_bounds_are_422(client_a):
    for url in (
        "/v1/transactions?limit=0",
        "/v1/transactions?limit=201",
        "/v1/transactions/changes?since=2000-01-01T00:00:00Z&limit=0",
        "/v1/transactions/changes?since=2000-01-01T00:00:00Z&limit=501",
    ):
        assert (await client_a.get(url)).status_code == 422, url


async def test_cursor_with_wrong_keys_is_400(client_a):
    bad = encode_cursor({"x": "1"})
    for url in (
        f"/v1/transactions?cursor={bad}",
        f"/v1/transactions/changes?since=2000-01-01T00:00:00Z&cursor={bad}",
    ):
        r = await client_a.get(url)
        assert r.status_code == 400 and r.json()["code"] == "invalid_cursor"


async def test_browse_cursor_rejected_by_changes_and_vice_versa(client_a, db_session):
    uid = await provision(client_a)
    cat = await first_category_id(db_session, uid)
    db_session.add_all(make(uid, cat, i) for i in range(3))
    await db_session.commit()
    browse_cursor = (await client_a.get("/v1/transactions?limit=1")).json()["next_cursor"]
    r = await client_a.get(
        f"/v1/transactions/changes?since=2000-01-01T00:00:00Z&cursor={browse_cursor}"
    )
    assert r.status_code == 400 and r.json()["code"] == "invalid_cursor"
    changes_cursor = (
        await client_a.get("/v1/transactions/changes?since=2000-01-01T00:00:00Z&limit=1")
    ).json()["next_cursor"]
    r = await client_a.get(f"/v1/transactions?cursor={changes_cursor}")
    assert r.status_code == 400 and r.json()["code"] == "invalid_cursor"


async def test_search_matches_tags_only_case_insensitively(client_a):
    cat = (await client_a.get("/v1/categories")).json()[0]["id"]
    await client_a.put(
        f"/v1/transactions/{uuid.uuid4()}", json={**BODY, "category_id": cat, "tags": ["Holiday"]}
    )
    await client_a.put(f"/v1/transactions/{uuid.uuid4()}", json={**BODY, "category_id": cat})
    items = (await client_a.get("/v1/transactions?q=holi")).json()["items"]
    assert len(items) == 1 and items[0]["tags"] == ["Holiday"]


async def test_deleted_excluded_from_browse_but_in_changes(client_a):
    cat = (await client_a.get("/v1/categories")).json()[0]["id"]
    tx_id = uuid.uuid4()
    await client_a.put(f"/v1/transactions/{tx_id}", json={**BODY, "category_id": cat})
    await client_a.delete(f"/v1/transactions/{tx_id}")
    assert (await client_a.get("/v1/transactions")).json()["items"] == []
    feed = (await client_a.get("/v1/transactions/changes?since=2000-01-01T00:00:00Z")).json()[
        "items"
    ]
    assert [t["id"] for t in feed] == [str(tx_id)] and feed[0]["deleted_at"] is not None
    assert (await client_a.get(f"/v1/transactions/{tx_id}")).status_code == 200


async def test_opening_balance_never_appears_in_reads(client_a, db_session):
    uid = await provision(client_a)
    ob = await seed_transaction(db_session, uid, kind="opening_balance", amount_minor=5000)
    assert (await client_a.get("/v1/transactions")).json()["items"] == []
    feed = (await client_a.get("/v1/transactions/changes?since=2000-01-01T00:00:00Z")).json()
    assert feed["items"] == []
    assert (await client_a.get(f"/v1/transactions/{ob.id}")).status_code == 404


async def test_changes_since_timezone_aware_and_naive(client_a):
    cat = (await client_a.get("/v1/categories")).json()[0]["id"]
    await client_a.put(f"/v1/transactions/{uuid.uuid4()}", json={**BODY, "category_id": cat})
    base = "/v1/transactions/changes?since="
    # aware values (Z and explicit offset) are honoured as instants
    assert len((await client_a.get(base + "2000-01-01T00:00:00Z")).json()["items"]) == 1
    assert len((await client_a.get(base + "2000-01-01T00:00:00%2B05:00")).json()["items"]) == 1
    assert (await client_a.get(base + "2999-01-01T00:00:00Z")).json()["items"] == []
    # naive values must not 500; they are interpreted as UTC
    r = await client_a.get(base + "2000-01-01T00:00:00")
    assert r.status_code == 200 and len(r.json()["items"]) == 1
    assert (await client_a.get(base + "2999-01-01T00:00:00")).json()["items"] == []


SINCE = "since=2000-01-01T00:00:00Z"


async def test_malformed_cursor_values_are_400(client_a):
    good_id = str(uuid.uuid4())
    browse = [
        {"d": "2026-01-01", "c": "2026-01-01T00:00:00", "i": good_id},  # naive
        {"d": "2026-01-01", "c": "not-a-time", "i": good_id},
        {"d": "2026-01-01", "c": "2026-01-01T00:00:00+00:00", "i": "not-a-uuid"},
        {"d": "not-a-date", "c": "2026-01-01T00:00:00+00:00", "i": good_id},
    ]
    changes = [
        {"u": "2026-01-01T00:00:00", "i": good_id},  # naive
        {"u": "not-a-time", "i": good_id},
        {"u": "2026-01-01T00:00:00+00:00", "i": "not-a-uuid"},
    ]
    for data in browse:
        r = await client_a.get(f"/v1/transactions?cursor={encode_cursor(data)}")
        assert r.status_code == 400 and r.json()["code"] == "invalid_cursor", data
    for data in changes:
        r = await client_a.get(f"/v1/transactions/changes?{SINCE}&cursor={encode_cursor(data)}")
        assert r.status_code == 400 and r.json()["code"] == "invalid_cursor", data


async def test_browse_tiebreak_full_order_with_identical_keys(client_a, db_session):
    uid = await provision(client_a)
    cat = await first_category_id(db_session, uid)
    ts = utcnow()
    rows = [
        Transaction(
            id=uuid.uuid4(), user_id=uid, kind="expense", amount_minor=100, currency="EUR",
            occurred_on=date(2026, 1, 1 + (i % 2)), category_id=cat, created_at=ts,
        )
        for i in range(30)
    ]  # fmt: skip
    db_session.add_all(rows)
    await db_session.commit()
    expected = [
        str(t.id)
        for t in sorted(rows, key=lambda t: (t.occurred_on, t.created_at, t.id), reverse=True)
    ]
    seen, cursor = [], None
    for _ in range(10):
        url = "/v1/transactions?limit=7" + (f"&cursor={cursor}" if cursor else "")
        page = (await client_a.get(url)).json()
        seen += [t["id"] for t in page["items"]]
        cursor = page["next_cursor"]
        if not cursor:
            break
    assert seen == expected


async def test_changes_tiebreak_by_id_with_identical_updated_at(client_a, db_session):
    uid = await provision(client_a)
    cat = await first_category_id(db_session, uid)
    ts = utcnow()
    rows = [
        Transaction(
            id=uuid.uuid4(), user_id=uid, kind="expense", amount_minor=100, currency="EUR",
            occurred_on=date(2026, 1, 1), category_id=cat, created_at=ts, updated_at=ts,
        )
        for _ in range(9)
    ]  # fmt: skip
    db_session.add_all(rows)
    await db_session.commit()
    expected = [str(i) for i in sorted(t.id for t in rows)]
    for limit in (1, 2):
        seen, cursor = [], None
        for _ in range(20):
            url = f"/v1/transactions/changes?{SINCE}&limit={limit}"
            if cursor:
                url += f"&cursor={cursor}"
            page = (await client_a.get(url)).json()
            seen += [t["id"] for t in page["items"]]
            cursor = page["next_cursor"]
            if not cursor:
                break
        assert seen == expected


async def test_changes_and_tags_are_scoped_to_the_user(client_a, client_b):
    cat_a = (await client_a.get("/v1/categories")).json()[0]["id"]
    cat_b = (await client_b.get("/v1/categories")).json()[0]["id"]
    a_id = uuid.uuid4()
    await client_a.put(
        f"/v1/transactions/{a_id}",
        json={**BODY, "category_id": cat_a, "tags": ["shared", "only-a"]},
    )
    await client_a.delete(f"/v1/transactions/{a_id}")
    await client_a.put(f"/v1/transactions/{uuid.uuid4()}", json={**BODY, "category_id": cat_a})
    await client_b.put(
        f"/v1/transactions/{uuid.uuid4()}",
        json={**BODY, "category_id": cat_b, "tags": ["shared", "only-b"]},
    )
    feed_b = (await client_b.get(f"/v1/transactions/changes?{SINCE}")).json()["items"]
    assert len(feed_b) == 1 and str(a_id) not in [t["id"] for t in feed_b]
    assert [t["name"] for t in (await client_b.get("/v1/tags")).json()] == ["only-b", "shared"]
    assert [t["name"] for t in (await client_a.get("/v1/tags")).json()] == ["only-a", "shared"]
    ids_a = {t["id"] for t in (await client_a.get("/v1/tags")).json()}
    ids_b = {t["id"] for t in (await client_b.get("/v1/tags")).json()}
    assert not ids_a & ids_b


async def test_search_underscore_and_backslash_are_literal(client_a):
    cat = (await client_a.get("/v1/categories")).json()[0]["id"]
    for m in ("a_c", "abc", "50\\off", "50xoff", "100% juice"):
        await client_a.put(
            f"/v1/transactions/{uuid.uuid4()}", json={**BODY, "category_id": cat, "merchant": m}
        )

    async def found(q: str) -> list[str]:
        r = await client_a.get("/v1/transactions", params={"q": q})
        return sorted(t["merchant"] for t in r.json()["items"])

    assert await found("a_c") == ["a_c"]
    assert await found("\\") == ["50\\off"]
    assert await found("%") == ["100% juice"]
