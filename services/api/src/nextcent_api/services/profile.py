import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from nextcent_api.clock import utcnow
from nextcent_api.errors import ProblemError
from nextcent_api.models import RecurringRule, Transaction, User
from nextcent_api.schemas.me import MeOut, MePatch
from nextcent_api.services.recurring import advance_past

INCOME_KEY = "monthly_income"


def first_of_next_month(today: date) -> date:
    return date(today.year + (today.month == 12), today.month % 12 + 1, 1)


async def _opening_balance(session: AsyncSession, user_id: uuid.UUID) -> Transaction | None:
    return await session.scalar(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.kind == "opening_balance",
            Transaction.deleted_at.is_(None),
        )
    )


async def _income_rule(session: AsyncSession, user_id: uuid.UUID) -> RecurringRule | None:
    return await session.scalar(
        select(RecurringRule).where(
            RecurringRule.user_id == user_id, RecurringRule.system_key == INCOME_KEY
        )
    )


async def get_profile(session: AsyncSession, user: User) -> MeOut:
    ob = await _opening_balance(session, user.id)
    rule = await _income_rule(session, user.id)
    return MeOut(
        id=user.id,
        home_currency=user.home_currency,
        opening_balance_minor=ob.amount_minor if ob else None,
        monthly_income_minor=rule.amount_minor if rule and rule.active else None,
        onboarding_completed=user.onboarded_at is not None,
        created_at=user.created_at,
    )


async def patch_profile(session: AsyncSession, user: User, patch: MePatch) -> MeOut:
    now = utcnow()
    if patch.home_currency and patch.home_currency != user.home_currency:
        used = await session.scalar(
            select(func.count())
            .select_from(Transaction)
            .where(
                Transaction.user_id == user.id,
                Transaction.kind.in_(("expense", "income")),
                Transaction.deleted_at.is_(None),
            )
        )
        if used:
            raise ProblemError(
                409, "currency_locked", "Home currency cannot change once transactions exist"
            )
        user.home_currency = patch.home_currency
        if ob := await _opening_balance(session, user.id):
            ob.currency, ob.version, ob.updated_at = patch.home_currency, ob.version + 1, now
        if rule := await _income_rule(session, user.id):
            rule.currency, rule.updated_at = patch.home_currency, now

    if patch.opening_balance_minor is not None:
        ob = await _opening_balance(session, user.id)
        if ob is None:
            session.add(
                Transaction(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    kind="opening_balance",
                    amount_minor=patch.opening_balance_minor,
                    currency=user.home_currency,
                    occurred_on=now.date(),
                )  # fmt: skip
            )
        else:
            ob.amount_minor = patch.opening_balance_minor
            ob.currency, ob.version, ob.updated_at = user.home_currency, ob.version + 1, now

    if "monthly_income_minor" in patch.model_fields_set:
        rule = await _income_rule(session, user.id)
        if patch.monthly_income_minor is None:
            if rule:
                rule.active, rule.updated_at = False, now
        elif rule is None:
            start = first_of_next_month(now.date())
            session.add(
                RecurringRule(
                    user_id=user.id,
                    kind="income",
                    amount_minor=patch.monthly_income_minor,
                    currency=user.home_currency,
                    merchant="Monthly income",
                    cadence="monthly",
                    anchor_on=start,
                    next_due_on=start,
                    system_key=INCOME_KEY,
                )  # fmt: skip
            )
        else:
            if not rule.active:
                rule.occurrences, rule.next_due_on = advance_past(
                    rule.anchor_on, rule.cadence, rule.occurrences, now.date()
                )
            rule.amount_minor, rule.active, rule.updated_at = patch.monthly_income_minor, True, now

    if patch.onboarding_completed and user.onboarded_at is None:
        user.onboarded_at = now
    await session.commit()
    return await get_profile(session, user)
