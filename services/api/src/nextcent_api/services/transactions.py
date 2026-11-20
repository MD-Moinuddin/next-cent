import uuid
from datetime import UTC, date, datetime
from typing import Literal

from sqlalchemy import or_, select, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from nextcent_api.clock import utcnow
from nextcent_api.errors import ProblemError
from nextcent_api.models import Category, Tag, Transaction
from nextcent_api.pagination import decode_cursor, encode_cursor
from nextcent_api.schemas.transactions import TransactionIn
from nextcent_api.services.tags import get_or_create_tags


def _not_found() -> ProblemError:
    return ProblemError(404, "transaction_not_found", "Transaction not found")


async def get_owned(session: AsyncSession, user_id: uuid.UUID, tx_id: uuid.UUID) -> Transaction:
    tx = await session.scalar(
        select(Transaction).where(
            Transaction.id == tx_id,
            Transaction.user_id == user_id,
            Transaction.kind != "opening_balance",  # managed only through /v1/me
        )
    )
    if tx is None:
        raise _not_found()
    return tx


async def _check_category(
    session: AsyncSession,
    user_id: uuid.UUID,
    category_id: uuid.UUID | None,
    current: uuid.UUID | None,
) -> None:
    if category_id is None:
        return
    category = await session.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user_id)
    )
    if category is None:
        raise ProblemError(422, "invalid_category", "Unknown category")
    if category.archived_at is not None and category_id != current:
        raise ProblemError(422, "category_archived", "Category is archived")


def _content_matches(tx: Transaction, p: TransactionIn) -> bool:
    return (
        tx.kind,
        tx.amount_minor,
        tx.currency,
        tx.occurred_on,
        tx.category_id,
        tx.merchant,
        tx.note,
    ) == (
        p.kind,
        p.amount_minor,
        p.currency,
        p.occurred_on,
        p.category_id,
        p.merchant,
        p.note,
    ) and {t.name.lower() for t in tx.tags} == {t.lower() for t in p.tags}


async def upsert_transaction(
    session: AsyncSession,
    user_id: uuid.UUID,
    tx_id: uuid.UUID,
    payload: TransactionIn,
    _retry: bool = True,
) -> tuple[Transaction, bool]:
    existing = await session.get(Transaction, tx_id, with_for_update=True)

    if existing is None:
        if payload.base_version is not None:
            raise _not_found()
        await _check_category(session, user_id, payload.category_id, None)
        tx = Transaction(
            id=tx_id, user_id=user_id, kind=payload.kind, amount_minor=payload.amount_minor,
            currency=payload.currency, occurred_on=payload.occurred_on,
            category_id=payload.category_id, merchant=payload.merchant, note=payload.note,
            version=1,
        )  # fmt: skip
        tx.tags = await get_or_create_tags(session, user_id, payload.tags)
        session.add(tx)
        try:
            await session.flush()
        except IntegrityError:
            await session.rollback()
            if not _retry:
                raise
            return await upsert_transaction(session, user_id, tx_id, payload, _retry=False)
        return tx, True

    if existing.user_id != user_id or existing.kind == "opening_balance":
        raise _not_found()
    if existing.deleted_at is not None:
        raise ProblemError(409, "transaction_deleted", "Transaction is deleted; restore it first")
    if _content_matches(existing, payload):
        return existing, False
    if payload.base_version != existing.version:
        raise ProblemError(
            409, "version_conflict", "Transaction was changed elsewhere",
            extra={"current_version": existing.version},
        )  # fmt: skip

    await _check_category(session, user_id, payload.category_id, existing.category_id)
    existing.kind, existing.amount_minor, existing.currency = (
        payload.kind,
        payload.amount_minor,
        payload.currency,
    )
    existing.occurred_on, existing.category_id = payload.occurred_on, payload.category_id
    existing.merchant, existing.note = payload.merchant, payload.note
    existing.tags = await get_or_create_tags(session, user_id, payload.tags)
    existing.version += 1
    existing.updated_at = utcnow()
    return existing, False


async def soft_delete(session: AsyncSession, user_id: uuid.UUID, tx_id: uuid.UUID) -> None:
    tx = await get_owned(session, user_id, tx_id)
    if tx.deleted_at is None:
        now = utcnow()
        tx.deleted_at, tx.updated_at, tx.version = now, now, tx.version + 1


async def restore(session: AsyncSession, user_id: uuid.UUID, tx_id: uuid.UUID) -> Transaction:
    tx = await get_owned(session, user_id, tx_id)
    if tx.deleted_at is not None:
        tx.deleted_at, tx.updated_at, tx.version = None, utcnow(), tx.version + 1
    return tx


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _parse(cursor: str, keys: tuple[str, ...]) -> dict[str, str]:
    data = decode_cursor(cursor)
    if set(data) != set(keys):
        raise ProblemError(400, "invalid_cursor", "Invalid pagination cursor")
    return data


async def browse(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    from_: date | None,
    to: date | None,
    category_id: uuid.UUID | None,
    kind: Literal["expense", "income"] | None,
    q: str | None,
    cursor: str | None,
    limit: int,
) -> tuple[list[Transaction], str | None]:
    stmt = select(Transaction).where(
        Transaction.user_id == user_id,
        Transaction.kind != "opening_balance",
        Transaction.deleted_at.is_(None),
    )
    if from_:
        stmt = stmt.where(Transaction.occurred_on >= from_)
    if to:
        stmt = stmt.where(Transaction.occurred_on <= to)
    if category_id:
        stmt = stmt.where(Transaction.category_id == category_id)
    if kind:
        stmt = stmt.where(Transaction.kind == kind)
    if q:
        pattern = f"%{_escape_like(q.strip())}%"
        stmt = stmt.where(
            or_(
                Transaction.merchant.ilike(pattern, escape="\\"),
                Transaction.note.ilike(pattern, escape="\\"),
                Transaction.tags.any(Tag.name.ilike(pattern, escape="\\")),
            )
        )
    if cursor:
        try:
            c = _parse(cursor, ("d", "c", "i"))
            created = datetime.fromisoformat(c["c"])
            if created.tzinfo is None:
                raise ValueError("naive timestamp")
            key = (date.fromisoformat(c["d"]), created, uuid.UUID(c["i"]))
        except ValueError as exc:
            raise ProblemError(400, "invalid_cursor", "Invalid pagination cursor") from exc
        stmt = stmt.where(
            tuple_(Transaction.occurred_on, Transaction.created_at, Transaction.id) < tuple_(*key)
        )
    stmt = stmt.order_by(
        Transaction.occurred_on.desc(), Transaction.created_at.desc(), Transaction.id.desc()
    ).limit(limit + 1)
    rows = list((await session.scalars(stmt)).all())
    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        last = rows[-1]
        next_cursor = encode_cursor(
            {"d": last.occurred_on.isoformat(), "c": last.created_at.isoformat(), "i": str(last.id)}
        )
    return rows, next_cursor


async def changes(
    session: AsyncSession, user_id: uuid.UUID, *, since: datetime, cursor: str | None, limit: int
) -> tuple[list[Transaction], str | None]:
    stmt = select(Transaction).where(
        Transaction.user_id == user_id, Transaction.kind != "opening_balance"
    )
    if cursor:
        try:
            c = _parse(cursor, ("u", "i"))
            updated = datetime.fromisoformat(c["u"])
            if updated.tzinfo is None:
                raise ValueError("naive timestamp")
            key = (updated, uuid.UUID(c["i"]))
        except ValueError as exc:
            raise ProblemError(400, "invalid_cursor", "Invalid pagination cursor") from exc
        stmt = stmt.where(tuple_(Transaction.updated_at, Transaction.id) > tuple_(*key))
    else:
        if since.tzinfo is None:  # naive values are interpreted as UTC
            since = since.replace(tzinfo=UTC)
        stmt = stmt.where(Transaction.updated_at >= since)
    stmt = stmt.order_by(Transaction.updated_at.asc(), Transaction.id.asc()).limit(limit + 1)
    rows = list((await session.scalars(stmt)).all())
    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        last = rows[-1]
        next_cursor = encode_cursor({"u": last.updated_at.isoformat(), "i": str(last.id)})
    return rows, next_cursor
