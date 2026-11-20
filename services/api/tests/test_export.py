import csv
import io
import uuid
from datetime import UTC, date, datetime

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from nextcent_api.clock import utcnow
from nextcent_api.models import Tag
from tests.helpers import seed_transaction

BOM = "﻿"


async def _uid(client: AsyncClient) -> uuid.UUID:
    return uuid.UUID((await client.get("/v1/me")).json()["id"])


async def _rows(client: AsyncClient) -> list[dict[str, str]]:
    r = await client.get("/v1/export.csv")
    assert r.status_code == 200
    return list(csv.DictReader(io.StringIO(r.text.removeprefix(BOM))))


async def test_export_exact_amounts_and_formula_guard(
    client_a: AsyncClient, db_session: AsyncSession
) -> None:
    uid = await _uid(client_a)
    await seed_transaction(
        db_session, uid, amount_minor=1999, currency="USD", merchant='=HYPERLINK("x")',
        note="plain", occurred_on=date(2026, 11, 2),
    )  # fmt: skip
    await seed_transaction(db_session, uid, amount_minor=1000, currency="JPY", merchant="Ramen",
                           occurred_on=date(2026, 11, 3))  # fmt: skip
    await seed_transaction(db_session, uid, amount_minor=5, merchant="gone", deleted_at=utcnow())
    r = await client_a.get("/v1/export.csv")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    assert r.text.startswith(BOM)
    rows = list(csv.DictReader(io.StringIO(r.text.removeprefix(BOM))))
    by_merchant = {row["merchant"]: row for row in rows}
    assert set(by_merchant) == {'\'=HYPERLINK("x")', "Ramen"}
    assert by_merchant['\'=HYPERLINK("x")']["amount"] == "19.99"
    assert by_merchant["Ramen"]["amount"] == "1000"
    assert rows[0].keys() >= {"id", "date", "type", "amount", "currency", "category", "tags"}


async def test_export_excludes_other_users(
    client_a: AsyncClient, client_b: AsyncClient, db_session: AsyncSession
) -> None:
    uid_a = await _uid(client_a)
    await seed_transaction(db_session, uid_a, merchant="secret")
    await client_b.get("/v1/me")
    assert "secret" not in (await client_b.get("/v1/export.csv")).text


async def test_export_contains_opening_balance_row(client_a: AsyncClient) -> None:
    await client_a.patch("/v1/me", json={"home_currency": "EUR", "opening_balance_minor": 12345})
    rows = await _rows(client_a)
    assert len(rows) == 1
    assert rows[0]["type"] == "opening_balance"
    assert rows[0]["amount"] == "123.45"
    assert rows[0]["currency"] == "EUR"
    assert rows[0]["category"] == ""


async def test_export_three_decimal_and_zero_decimal_currencies(
    client_a: AsyncClient, db_session: AsyncSession
) -> None:
    uid = await _uid(client_a)
    await seed_transaction(db_session, uid, amount_minor=1234, currency="KWD", merchant="kwd",
                           occurred_on=date(2026, 11, 1))  # fmt: skip
    await seed_transaction(db_session, uid, amount_minor=7, currency="JPY", merchant="jpy",
                           occurred_on=date(2026, 11, 2))  # fmt: skip
    by_merchant = {row["merchant"]: row for row in await _rows(client_a)}
    assert by_merchant["kwd"]["amount"] == "1.234"
    assert by_merchant["jpy"]["amount"] == "7"


async def test_export_formula_guard_prefixes(
    client_a: AsyncClient, db_session: AsyncSession
) -> None:
    uid = await _uid(client_a)
    notes = ["+1", "-1", "@sum", "\tx", "-", "safe-text"]
    for i, note in enumerate(notes):
        await seed_transaction(db_session, uid, note=note, merchant=f"m{i}",
                               occurred_on=date(2026, 11, 1))  # fmt: skip
    by_merchant = {row["merchant"]: row["note"] for row in await _rows(client_a)}
    assert [by_merchant[f"m{i}"] for i in range(len(notes))] == [
        "'+1", "'-1", "'@sum", "'\tx", "'-", "safe-text",
    ]  # fmt: skip


async def test_export_orders_by_date_then_created_at(
    client_a: AsyncClient, db_session: AsyncSession
) -> None:
    uid = await _uid(client_a)

    def t(minute: int) -> datetime:
        return datetime(2026, 11, 1, 10, minute, tzinfo=UTC)

    await seed_transaction(
        db_session, uid, merchant="c", occurred_on=date(2026, 11, 5), created_at=t(0)
    )
    await seed_transaction(
        db_session, uid, merchant="b", occurred_on=date(2026, 11, 2), created_at=t(30)
    )
    await seed_transaction(
        db_session, uid, merchant="a", occurred_on=date(2026, 11, 2), created_at=t(10)
    )
    assert [row["merchant"] for row in await _rows(client_a)] == ["a", "b", "c"]


async def test_export_soft_deleted_excluded(
    client_a: AsyncClient, db_session: AsyncSession
) -> None:
    uid = await _uid(client_a)
    await seed_transaction(db_session, uid, merchant="kept")
    await seed_transaction(db_session, uid, merchant="removed", deleted_at=utcnow())
    assert [row["merchant"] for row in await _rows(client_a)] == ["kept"]


async def test_export_merchant_formula_guard(
    client_a: AsyncClient, db_session: AsyncSession
) -> None:
    uid = await _uid(client_a)
    merchants = ["=a", "+a", "-a", "@a", "\ta", "plain"]
    for i, merchant in enumerate(merchants):
        await seed_transaction(
            db_session, uid, merchant=merchant, note=f"n{i}", occurred_on=date(2026, 11, 1)
        )
    by_note = {row["note"]: row["merchant"] for row in await _rows(client_a)}
    assert [by_note[f"n{i}"] for i in range(len(merchants))] == [
        "'=a", "'+a", "'-a", "'@a", "'\ta", "plain",
    ]  # fmt: skip


async def test_export_category_name_formula_guard(
    client_a: AsyncClient, db_session: AsyncSession
) -> None:
    uid = await _uid(client_a)
    cats = {c["name"]: c["id"] for c in (await client_a.get("/v1/categories")).json()}
    r = await client_a.patch(f"/v1/categories/{cats['Groceries']}", json={"name": "=Groceries"})
    assert r.status_code == 200
    await seed_transaction(db_session, uid, category_id=uuid.UUID(cats["Groceries"]), merchant="m")
    rows = await _rows(client_a)
    assert rows[0]["category"] == "'=Groceries"


async def test_export_tags_sorted_joined_and_guarded(
    client_a: AsyncClient, db_session: AsyncSession
) -> None:
    uid = await _uid(client_a)

    def tags(*names: str) -> list[Tag]:
        return [Tag(user_id=uid, name=n) for n in names]

    # Sorted order is "=x", "A", "b": the cell starts with "=", so the whole cell is guarded.
    await seed_transaction(db_session, uid, merchant="first_eq", tags=tags("b", "A", "=x"))
    # First sorted tag is plain; a later "=" tag does not trigger the guard.
    await seed_transaction(db_session, uid, merchant="later_eq", tags=tags("d", "C", "z=", "y"))
    await seed_transaction(db_session, uid, merchant="none")
    by_merchant = {row["merchant"]: row["tags"] for row in await _rows(client_a)}
    assert by_merchant["first_eq"] == "'=x; A; b"
    assert by_merchant["later_eq"] == "C; d; y; z="
    assert by_merchant["none"] == ""


async def test_export_ties_ordered_by_id(client_a: AsyncClient, db_session: AsyncSession) -> None:
    uid = await _uid(client_a)
    created = datetime(2026, 11, 1, 10, 0, tzinfo=UTC)
    ids = [uuid.UUID(int=n) for n in (1, 2, 3)]
    for tx_id, merchant in zip(reversed(ids), ["c", "b", "a"], strict=True):
        await seed_transaction(
            db_session, uid, id=tx_id, merchant=merchant,
            occurred_on=date(2026, 11, 1), created_at=created,
        )  # fmt: skip
    rows = await _rows(client_a)
    assert [row["id"] for row in rows] == [str(i) for i in ids]
