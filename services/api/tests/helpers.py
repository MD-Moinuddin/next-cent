import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from nextcent_api.models import Category, Transaction


async def first_category_id(session: AsyncSession, user_id: uuid.UUID) -> uuid.UUID:
    result = await session.scalars(
        select(Category.id).where(Category.user_id == user_id).order_by(Category.name)
    )
    category_id = result.first()
    assert category_id is not None
    return category_id


async def seed_transaction(session: AsyncSession, user_id: uuid.UUID, **kw: Any) -> Transaction:
    kind = kw.pop("kind", "expense")
    category_id = kw.pop("category_id", None)
    if kind == "expense" and category_id is None:
        category_id = await first_category_id(session, user_id)
    tx = Transaction(
        id=kw.pop("id", uuid.uuid4()),
        user_id=user_id,
        kind=kind,
        amount_minor=kw.pop("amount_minor", 1000),
        currency=kw.pop("currency", "USD"),
        occurred_on=kw.pop("occurred_on", date(2026, 11, 1)),
        category_id=category_id,
        **kw,
    )
    session.add(tx)
    await session.commit()
    return tx
