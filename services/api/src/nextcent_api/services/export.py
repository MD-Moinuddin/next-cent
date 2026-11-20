import csv
import io
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from nextcent_api.models import Category, Transaction
from nextcent_api.money import minor_to_decimal_string

MAX_ROWS = 100_000
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
COLUMNS = ["id", "date", "type", "amount", "currency", "category", "merchant", "note", "tags",
           "created_at", "updated_at"]  # fmt: skip


def safe_cell(value: str | None) -> str:
    if not value:
        return ""
    return "'" + value if value.startswith(FORMULA_PREFIXES) else value


async def build_csv(session: AsyncSession, user_id: uuid.UUID) -> str:
    rows = await session.execute(
        select(Transaction, Category.name)
        .outerjoin(Category, Category.id == Transaction.category_id)
        .where(Transaction.user_id == user_id, Transaction.deleted_at.is_(None))
        .order_by(Transaction.occurred_on, Transaction.created_at, Transaction.id)
        .limit(MAX_ROWS)
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(COLUMNS)
    for tx, category_name in rows.all():
        writer.writerow([
            str(tx.id), tx.occurred_on.isoformat(), tx.kind,
            minor_to_decimal_string(tx.amount_minor, tx.currency), tx.currency,
            safe_cell(category_name), safe_cell(tx.merchant), safe_cell(tx.note),
            safe_cell("; ".join(sorted(t.name for t in tx.tags))),
            tx.created_at.isoformat(), tx.updated_at.isoformat(),
        ])  # fmt: skip
    return "﻿" + buffer.getvalue()
