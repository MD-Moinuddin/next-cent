import uuid

from sqlalchemy import func, literal, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from nextcent_api.models import Tag


async def _db_keys(session: AsyncSession, names: list[str]) -> list[str]:
    """Lowercase keys as PostgreSQL computes them (what uq_tag_name indexes)."""
    row = (await session.execute(select(*[func.lower(literal(n)) for n in names]))).one()
    return list(row)


async def _existing(session: AsyncSession, user_id: uuid.UUID, keys: list[str]) -> dict[str, Tag]:
    rows = await session.execute(
        select(func.lower(Tag.name), Tag).where(
            Tag.user_id == user_id, func.lower(Tag.name).in_(keys)
        )
    )
    return {key: tag for key, tag in rows.all()}


async def get_or_create_tags(
    session: AsyncSession, user_id: uuid.UUID, names: list[str]
) -> list[Tag]:
    if not names:
        return []
    # Keyed by the database's lower(), so Python/PostgreSQL case-folding differences
    # cannot cause a KeyError.
    by_key = dict(zip(await _db_keys(session, names), names, strict=True))
    found = await _existing(session, user_id, list(by_key))
    # Sorted by the indexed key so concurrent multi-row inserts take index locks in the
    # same order (no deadlocks).
    missing = [by_key[k] for k in sorted(by_key) if k not in found]
    if missing:
        await session.execute(
            pg_insert(Tag)
            .values([{"id": uuid.uuid4(), "user_id": user_id, "name": n} for n in missing])
            .on_conflict_do_nothing()
        )
        found = await _existing(session, user_id, list(by_key))
    return [found[k] for k in by_key]
