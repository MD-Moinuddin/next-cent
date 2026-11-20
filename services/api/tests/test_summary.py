import uuid
from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from nextcent_api.clock import utcnow
from tests.helpers import seed_transaction


async def _uid(client: AsyncClient) -> uuid.UUID:
    return uuid.UUID((await client.get("/v1/me")).json()["id"])


async def test_golden_dataset(client_a: AsyncClient, db_session: AsyncSession) -> None:
    await client_a.patch("/v1/me", json={"home_currency": "EUR", "opening_balance_minor": 100000})
    uid = await _uid(client_a)
    cats = {c["name"]: uuid.UUID(c["id"]) for c in (await client_a.get("/v1/categories")).json()}
    g, h = cats["Groceries"], cats["Housing"]
    rows = [
        dict(kind="income", amount_minor=240000, currency="EUR", occurred_on=date(2026, 11, 1)),
        dict(amount_minor=3250, currency="EUR", occurred_on=date(2026, 11, 3), category_id=g),
        dict(amount_minor=1450, currency="EUR", occurred_on=date(2026, 11, 10), category_id=g),
        dict(amount_minor=12000, currency="EUR", occurred_on=date(2026, 11, 1), category_id=h),
        dict(amount_minor=700, currency="EUR", occurred_on=date(2026, 10, 31), category_id=g),
        dict(amount_minor=9999, currency="EUR", occurred_on=date(2026, 11, 5), category_id=g,
             deleted_at=utcnow()),
        dict(amount_minor=5000, currency="USD", occurred_on=date(2026, 11, 5), category_id=g),
    ]  # fmt: skip
    for row in rows:
        await seed_transaction(db_session, uid, **row)

    body = (await client_a.get("/v1/summary?from=2026-11-01&to=2026-11-30")).json()
    assert body["currency"] == "EUR"
    assert body["income_minor"] == 240000
    assert body["expense_minor"] == 16700
    assert body["net_minor"] == 223300
    assert body["balance_minor"] == 322600  # 100000 + 240000 - (3250 + 1450 + 12000 + 700)
    assert [(c["name"], c["total_minor"]) for c in body["by_category"]] == [
        ("Housing", 12000),
        ("Groceries", 4700),
    ]
    assert body["excluded_other_currency_count"] == 1


async def test_empty_user_summary_is_all_zero(client_a: AsyncClient) -> None:
    body = (await client_a.get("/v1/summary?from=2026-11-01&to=2026-11-30")).json()
    assert body["income_minor"] == body["expense_minor"] == body["balance_minor"] == 0
    assert body["by_category"] == []


async def test_range_validation(client_a: AsyncClient) -> None:
    assert (await client_a.get("/v1/summary?from=2026-11-30&to=2026-11-01")).status_code == 422
    assert (await client_a.get("/v1/summary?from=2000-01-01&to=2026-11-01")).status_code == 422
    assert (await client_a.get("/v1/summary?from=2026-11-01")).status_code == 422


async def test_boundary_days_are_inclusive_and_outside_days_excluded(
    client_a: AsyncClient, db_session: AsyncSession
) -> None:
    uid = await _uid(client_a)
    for amount, day in [(1, date(2026, 10, 31)), (10, date(2026, 11, 1)),
                        (100, date(2026, 11, 30)), (1000, date(2026, 12, 1))]:  # fmt: skip
        await seed_transaction(db_session, uid, amount_minor=amount, occurred_on=day)
    body = (await client_a.get("/v1/summary?from=2026-11-01&to=2026-11-30")).json()
    assert body["expense_minor"] == 110
    assert body["balance_minor"] == -1111  # balance is all-time


async def test_only_opening_balance(client_a: AsyncClient) -> None:
    await client_a.patch("/v1/me", json={"opening_balance_minor": 54321})
    today = utcnow().date().isoformat()
    body = (await client_a.get(f"/v1/summary?from={today}&to={today}")).json()
    assert body["balance_minor"] == 54321
    assert body["income_minor"] == 0
    assert body["expense_minor"] == 0
    assert body["net_minor"] == 0
    assert body["by_category"] == []


async def test_soft_deleted_excluded_everywhere(
    client_a: AsyncClient, db_session: AsyncSession
) -> None:
    uid = await _uid(client_a)
    await seed_transaction(db_session, uid, amount_minor=300, occurred_on=date(2026, 11, 2))
    await seed_transaction(
        db_session, uid, amount_minor=7000, occurred_on=date(2026, 11, 2), deleted_at=utcnow()
    )
    await seed_transaction(
        db_session, uid, kind="income", amount_minor=9000, occurred_on=date(2026, 11, 2),
        deleted_at=utcnow(),
    )  # fmt: skip
    body = (await client_a.get("/v1/summary?from=2026-11-01&to=2026-11-30")).json()
    assert body["expense_minor"] == 300
    assert body["income_minor"] == 0
    assert body["balance_minor"] == -300
    assert [c["total_minor"] for c in body["by_category"]] == [300]


async def test_span_boundary(client_a: AsyncClient) -> None:
    start = date(2016, 1, 1)
    ok = await client_a.get(f"/v1/summary?from={start}&to={start + timedelta(days=3660)}")
    assert ok.status_code == 200
    too_long = await client_a.get(f"/v1/summary?from={start}&to={start + timedelta(days=3661)}")
    assert too_long.status_code == 422
    assert too_long.json()["code"] == "invalid_range"


async def test_other_currency_rows_are_excluded_and_counted(
    client_a: AsyncClient, db_session: AsyncSession
) -> None:
    await client_a.patch("/v1/me", json={"home_currency": "EUR"})
    uid = await _uid(client_a)
    cats = {c["name"]: uuid.UUID(c["id"]) for c in (await client_a.get("/v1/categories")).json()}
    g, h = cats["Groceries"], cats["Housing"]
    nov = date(2026, 11, 10)
    rows = [
        dict(kind="income", amount_minor=5000, currency="EUR", occurred_on=nov),
        dict(amount_minor=1000, currency="EUR", occurred_on=nov, category_id=g),
        # other currency, in range, live: all counted as excluded
        dict(kind="income", amount_minor=7000, currency="USD", occurred_on=nov),
        dict(amount_minor=300, currency="USD", occurred_on=nov, category_id=g),
        dict(amount_minor=200, currency="USD", occurred_on=date(2026, 11, 1), category_id=h),
        dict(amount_minor=100, currency="GBP", occurred_on=date(2026, 11, 30), category_id=h),
        # other currency but deleted or out of range: not counted
        dict(amount_minor=50, currency="USD", occurred_on=nov, category_id=g, deleted_at=utcnow()),
        dict(kind="income", amount_minor=60, currency="USD", occurred_on=date(2026, 10, 31)),
        dict(amount_minor=70, currency="USD", occurred_on=date(2026, 12, 1), category_id=g),
    ]  # fmt: skip
    for row in rows:
        await seed_transaction(db_session, uid, **row)
    body = (await client_a.get("/v1/summary?from=2026-11-01&to=2026-11-30")).json()
    assert body["income_minor"] == 5000
    assert body["expense_minor"] == 1000
    assert body["net_minor"] == 4000
    assert body["balance_minor"] == 4000
    assert [(c["name"], c["total_minor"]) for c in body["by_category"]] == [("Groceries", 1000)]
    assert body["excluded_other_currency_count"] == 4


async def test_summary_isolation_between_users(
    client_a: AsyncClient, client_b: AsyncClient, db_session: AsyncSession
) -> None:
    query = "/v1/summary?from=2026-11-01&to=2026-11-30"
    await client_a.patch("/v1/me", json={"home_currency": "USD", "opening_balance_minor": 10000})
    await client_b.patch("/v1/me", json={"home_currency": "USD", "opening_balance_minor": 500})
    uid_a, uid_b = await _uid(client_a), await _uid(client_b)
    extra = (await client_a.post("/v1/categories", json={"name": "A-only"})).json()
    cats_a = {c["name"]: uuid.UUID(c["id"]) for c in (await client_a.get("/v1/categories")).json()}
    cats_b = {c["name"]: uuid.UUID(c["id"]) for c in (await client_b.get("/v1/categories")).json()}
    day = date(2026, 11, 4)
    await seed_transaction(db_session, uid_a, kind="income", amount_minor=50000, occurred_on=day)
    await seed_transaction(
        db_session, uid_a, amount_minor=2000, occurred_on=day, category_id=cats_a["Groceries"]
    )
    await seed_transaction(
        db_session, uid_a, amount_minor=800, occurred_on=day, category_id=uuid.UUID(extra["id"])
    )
    a_before = (await client_a.get(query)).json()

    await seed_transaction(db_session, uid_b, kind="income", amount_minor=900, occurred_on=day)
    await seed_transaction(
        db_session, uid_b, amount_minor=120, occurred_on=day, category_id=cats_b["Transport"]
    )

    b = (await client_b.get(query)).json()
    assert b["income_minor"] == 900
    assert b["expense_minor"] == 120
    assert b["balance_minor"] == 1280  # 500 + 900 - 120
    assert [c["name"] for c in b["by_category"]] == ["Transport"]
    assert "A-only" not in str(b) and "Groceries" not in str(b)

    a = (await client_a.get(query)).json()
    assert a == a_before
    assert a["income_minor"] == 50000
    assert a["expense_minor"] == 2800
    assert a["balance_minor"] == 57200  # 10000 + 50000 - 2800
    assert [(c["name"], c["total_minor"]) for c in a["by_category"]] == [
        ("Groceries", 2000),
        ("A-only", 800),
    ]


async def test_category_ties_ordered_by_name(
    client_a: AsyncClient, db_session: AsyncSession
) -> None:
    uid = await _uid(client_a)
    cats = {c["name"]: uuid.UUID(c["id"]) for c in (await client_a.get("/v1/categories")).json()}
    for name in ("Transport", "Dining", "Health"):
        await seed_transaction(
            db_session, uid, amount_minor=500, occurred_on=date(2026, 11, 2), category_id=cats[name]
        )
    body = (await client_a.get("/v1/summary?from=2026-11-01&to=2026-11-30")).json()
    assert [c["name"] for c in body["by_category"]] == ["Dining", "Health", "Transport"]
