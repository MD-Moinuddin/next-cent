from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


async def test_expected_tables_exist(engine: AsyncEngine) -> None:
    async with engine.connect() as conn:
        rows = await conn.execute(
            text("select table_name from information_schema.tables where table_schema='public'")
        )
        names = {r[0] for r in rows}
    expected = {
        "users",
        "categories",
        "transactions",
        "tags",
        "transaction_tags",
        "recurring_rules",
    }
    assert expected <= names
