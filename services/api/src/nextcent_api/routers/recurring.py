import uuid
from datetime import date, timedelta

from fastapi import APIRouter
from sqlalchemy import func, select

from nextcent_api.clock import utcnow
from nextcent_api.deps import CurrentUser, Session
from nextcent_api.errors import ProblemError
from nextcent_api.models import Category, RecurringRule, User
from nextcent_api.schemas.recurring import RecurringIn, RecurringOut, RecurringPatch
from nextcent_api.services.recurring import advance_past

router = APIRouter(prefix="/recurring", tags=["recurring"])

# A new rule may start at most a year back (bounded catch-up) and at most about ten years ahead.
ANCHOR_PAST_DAYS = 366
ANCHOR_FUTURE_DAYS = 3660
MAX_RULES_PER_USER = 100


def _check_anchor(anchor_on: date, today: date) -> None:
    earliest = today - timedelta(days=ANCHOR_PAST_DAYS)
    latest = today + timedelta(days=ANCHOR_FUTURE_DAYS)
    if not earliest <= anchor_on <= latest:
        raise ProblemError(
            422,
            "anchor_out_of_range",
            "Start date out of range",
            detail=f"anchor_on must be between {earliest.isoformat()} and {latest.isoformat()}",
        )


def _out(rule: RecurringRule) -> RecurringOut:
    return RecurringOut(
        id=rule.id, kind=rule.kind, amount_minor=rule.amount_minor, currency=rule.currency,
        category_id=rule.category_id, merchant=rule.merchant, cadence=rule.cadence,
        anchor_on=rule.anchor_on, next_due_on=rule.next_due_on, active=rule.active,
        is_primary_income=rule.system_key == "monthly_income",
    )  # fmt: skip


async def _check_category(
    session: Session, user_id: uuid.UUID, category_id: uuid.UUID | None
) -> None:
    if category_id is None:
        return
    found = await session.scalar(
        select(Category.id).where(
            Category.id == category_id, Category.user_id == user_id, Category.archived_at.is_(None)
        )
    )
    if found is None:
        raise ProblemError(422, "invalid_category", "Unknown or archived category")


@router.get("", response_model=list[RecurringOut], operation_id="list_recurring")
async def list_recurring(user: CurrentUser, session: Session) -> list[RecurringOut]:
    rows = await session.scalars(
        select(RecurringRule)
        .where(RecurringRule.user_id == user.id)
        .order_by(RecurringRule.next_due_on)
    )
    return [_out(r) for r in rows]


@router.post("", response_model=RecurringOut, status_code=201, operation_id="create_recurring")
async def create_recurring(body: RecurringIn, user: CurrentUser, session: Session) -> RecurringOut:
    _check_anchor(body.anchor_on, utcnow().date())
    await _check_category(session, user.id, body.category_id)
    # Lock the user row so two parallel creates cannot both pass the cap.
    await session.execute(select(User.id).where(User.id == user.id).with_for_update())
    count = await session.scalar(
        select(func.count()).select_from(RecurringRule).where(RecurringRule.user_id == user.id)
    )
    if (count or 0) >= MAX_RULES_PER_USER:
        raise ProblemError(
            409, "too_many_rules", f"At most {MAX_RULES_PER_USER} recurring rules per user"
        )
    rule = RecurringRule(
        user_id=user.id, kind=body.kind, amount_minor=body.amount_minor, currency=body.currency,
        category_id=body.category_id, merchant=body.merchant, cadence=body.cadence,
        anchor_on=body.anchor_on, next_due_on=body.anchor_on,
    )  # fmt: skip
    session.add(rule)
    await session.commit()
    return _out(rule)


@router.patch("/{rule_id}", response_model=RecurringOut, operation_id="patch_recurring")
async def patch_recurring(
    rule_id: uuid.UUID, body: RecurringPatch, user: CurrentUser, session: Session
) -> RecurringOut:
    rule = await session.scalar(
        select(RecurringRule).where(RecurringRule.id == rule_id, RecurringRule.user_id == user.id)
    )
    if rule is None:
        raise ProblemError(404, "recurring_not_found", "Recurring rule not found")
    if "category_id" in body.model_fields_set:
        if body.category_id is None and rule.kind == "expense":
            raise ProblemError(422, "invalid_category", "Expenses need a category")
        await _check_category(session, user.id, body.category_id)
        rule.category_id = body.category_id
    if body.amount_minor is not None:
        rule.amount_minor = body.amount_minor
    if "merchant" in body.model_fields_set:
        rule.merchant = (body.merchant or "").strip() or None
    now = utcnow()
    if body.active is not None:
        if body.active and not rule.active:
            rule.occurrences, rule.next_due_on = advance_past(
                rule.anchor_on, rule.cadence, rule.occurrences, now.date()
            )
        rule.active = body.active
    rule.updated_at = now
    await session.commit()
    return _out(rule)
