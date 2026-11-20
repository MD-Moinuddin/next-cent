import calendar
import logging
import uuid
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from nextcent_api.clock import utcnow
from nextcent_api.models import RecurringRule, Transaction

MAX_CATCHUP = 366
logger = logging.getLogger("nextcent.recurring")


def add_months(d: date, months: int) -> date:
    carry, month0 = divmod(d.month - 1 + months, 12)
    year, month = d.year + carry, month0 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def occurrence_date(anchor: date, cadence: str, n: int) -> date:
    if cadence == "weekly":
        return anchor + timedelta(days=7 * n)
    if cadence == "monthly":
        return add_months(anchor, n)
    if cadence == "yearly":
        return add_months(anchor, 12 * n)
    raise ValueError(f"unknown cadence: {cadence}")


def advance_past(anchor_on: date, cadence: str, occurrences: int, today: date) -> tuple[int, date]:
    """Skip to the first occurrence strictly after `today`, without generating the gap."""
    while (next_due := occurrence_date(anchor_on, cadence, occurrences)) <= today:
        occurrences += 1
    return occurrences, next_due


@dataclass(frozen=True)
class GenerationResult:
    created: int
    failed: int


async def generate_due_transactions(session: AsyncSession, today: date) -> GenerationResult:
    """Generate due occurrences, one rule per transaction.

    Each rule is locked (FOR UPDATE SKIP LOCKED, so parallel runs split the work), caught up and
    committed on its own. A rule that fails is rolled back, logged without row data and counted, so
    one bad rule or a long catch-up never blocks the other users' rules.
    """
    due_ids = (
        await session.scalars(
            select(RecurringRule.id)
            .where(RecurringRule.active.is_(True), RecurringRule.next_due_on <= today)
            .order_by(RecurringRule.next_due_on, RecurringRule.id)
        )
    ).all()
    await session.commit()  # release the snapshot; every rule below runs in its own transaction
    created = failed = 0
    for rule_id in due_ids:
        try:
            generated = await _generate_rule(session, rule_id, today)
            await session.commit()
            created += generated  # counted only once the rows are committed
        except Exception as exc:
            await session.rollback()
            failed += 1
            # Only the opaque rule id and the error class: messages can carry SQL or row values.
            logger.error(
                "recurring generation failed for rule %s (%s)", rule_id, type(exc).__name__
            )
    return GenerationResult(created=created, failed=failed)


async def _generate_rule(session: AsyncSession, rule_id: uuid.UUID, today: date) -> int:
    rule = await session.scalar(
        select(RecurringRule)
        .where(
            RecurringRule.id == rule_id,
            RecurringRule.active.is_(True),
            RecurringRule.next_due_on <= today,
        )
        .with_for_update(skip_locked=True)
    )
    if rule is None:  # another run holds or already finished it, or it changed meanwhile
        return 0
    created = 0
    now = utcnow()
    steps = 0
    while rule.next_due_on <= today and steps < MAX_CATCHUP:
        inserted = await session.scalar(
            pg_insert(Transaction)
            .values(
                id=uuid.uuid4(),
                user_id=rule.user_id,
                kind=rule.kind,
                amount_minor=rule.amount_minor,
                currency=rule.currency,
                occurred_on=rule.next_due_on,
                category_id=rule.category_id,
                merchant=rule.merchant,
                note=None,
                recurring_id=rule.id,
                version=1,
                created_at=now,
                updated_at=now,
            )  # fmt: skip
            .on_conflict_do_nothing(
                index_elements=["recurring_id", "occurred_on"],
                index_where=Transaction.recurring_id.is_not(None),
            )
            .returning(Transaction.id)
        )
        created += inserted is not None
        rule.occurrences += 1
        rule.next_due_on = occurrence_date(rule.anchor_on, rule.cadence, rule.occurrences)
        rule.updated_at = now
        steps += 1
    await session.flush()
    return created
