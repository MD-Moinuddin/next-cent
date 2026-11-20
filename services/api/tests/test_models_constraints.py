import uuid
from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from nextcent_api.models import Category, RecurringRule, Tag, Transaction, User, transaction_tags


async def make_user(session: AsyncSession, subject: str = "u1") -> User:
    user = User(auth_subject=subject)
    session.add(user)
    await session.flush()
    return user


async def make_category(session: AsyncSession, user: User) -> Category:
    cat = Category(user_id=user.id, name="Groceries")
    session.add(cat)
    await session.flush()
    return cat


def tx(user: User, **kw: object) -> Transaction:
    base: dict[str, object] = dict(
        id=uuid.uuid4(), user_id=user.id, kind="income", amount_minor=100,
        currency="EUR", occurred_on=date(2026, 11, 1),
    )  # fmt: skip
    base.update(kw)
    return Transaction(**base)


async def test_expense_requires_category(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    db_session.add(tx(user, kind="expense", category_id=None))
    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.parametrize("amount", [0, -5])
async def test_income_amount_must_be_positive(db_session: AsyncSession, amount: int) -> None:
    user = await make_user(db_session)
    db_session.add(tx(user, amount_minor=amount))
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_opening_balance_may_be_zero_but_only_one(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    db_session.add(tx(user, kind="opening_balance", amount_minor=0))
    await db_session.flush()
    db_session.add(tx(user, kind="opening_balance", amount_minor=5))
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_currency_must_be_three_uppercase_letters(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    db_session.add(tx(user, currency="eur"))
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_recurring_occurrence_is_unique(db_session: AsyncSession) -> None:
    user = await make_user(db_session)
    rule = RecurringRule(
        user_id=user.id, kind="income", amount_minor=100, currency="EUR", cadence="monthly",
        anchor_on=date(2026, 11, 1), next_due_on=date(2026, 11, 1),
    )  # fmt: skip
    db_session.add(rule)
    await db_session.flush()
    db_session.add(tx(user, recurring_id=rule.id))
    await db_session.flush()
    db_session.add(tx(user, recurring_id=rule.id))
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_category_names_unique_among_active_case_insensitive(
    db_session: AsyncSession,
) -> None:
    user = await make_user(db_session)
    db_session.add(Category(user_id=user.id, name="Food"))
    await db_session.flush()
    db_session.add(Category(user_id=user.id, name="food"))
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_deleting_user_cascades_everything(db_session: AsyncSession) -> None:
    async def populate(user: User) -> None:
        cat = await make_category(db_session, user)
        rule = RecurringRule(
            user_id=user.id, kind="expense", amount_minor=100, currency="EUR",
            category_id=cat.id, cadence="monthly", anchor_on=date(2026, 11, 1),
            next_due_on=date(2026, 11, 1),
        )  # fmt: skip
        tag = Tag(user_id=user.id, name=f"tag-{user.auth_subject}")
        db_session.add_all([rule, tag])
        await db_session.flush()
        db_session.add(
            tx(user, kind="expense", category_id=cat.id, recurring_id=rule.id, tags=[tag])
        )
        await db_session.flush()

    user = await make_user(db_session)
    other = await make_user(db_session, "u2")
    await populate(user)
    await populate(other)
    await db_session.commit()
    other_id = other.id
    await db_session.delete(user)
    await db_session.commit()
    db_session.expire_all()
    for model in (Transaction, Category, RecurringRule, Tag):
        owners = (await db_session.scalars(select(model.user_id))).all()
        assert owners == [other_id], model.__name__
    links = (await db_session.execute(select(transaction_tags))).all()
    assert len(links) == 1
    linked_tx = await db_session.get(Transaction, links[0].transaction_id)
    assert linked_tx is not None and linked_tx.user_id == other_id
