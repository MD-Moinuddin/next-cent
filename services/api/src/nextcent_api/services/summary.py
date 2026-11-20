import uuid
from datetime import date

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from nextcent_api.models import Category, Transaction
from nextcent_api.schemas.summary import CategoryTotal, SummaryOut


async def compute_summary(
    session: AsyncSession, user_id: uuid.UUID, home_currency: str, start: date, end: date
) -> SummaryOut:
    live = (Transaction.user_id == user_id, Transaction.deleted_at.is_(None))
    in_range = Transaction.occurred_on.between(start, end)

    totals = dict(
        (
            await session.execute(
                select(Transaction.kind, func.coalesce(func.sum(Transaction.amount_minor), 0))
                .where(*live, in_range, Transaction.currency == home_currency,
                       Transaction.kind.in_(("expense", "income")))
                .group_by(Transaction.kind)
            )
        ).all()
    )  # fmt: skip
    income, expense = int(totals.get("income", 0)), int(totals.get("expense", 0))

    total_expr = func.sum(Transaction.amount_minor)
    by_category = [
        CategoryTotal(category_id=cid, name=name, icon=icon, total_minor=int(total))
        for cid, name, icon, total in (
            await session.execute(
                select(Category.id, Category.name, Category.icon, total_expr)
                .join(Category, Category.id == Transaction.category_id)
                .where(*live, in_range, Transaction.currency == home_currency,
                       Transaction.kind == "expense")
                .group_by(Category.id, Category.name, Category.icon)
                .order_by(total_expr.desc(), Category.name)
            )
        ).all()
    ]  # fmt: skip

    balance = await session.scalar(
        select(
            func.coalesce(
                func.sum(case((Transaction.kind == "expense", -Transaction.amount_minor),
                              else_=Transaction.amount_minor)),
                0,
            )
        ).where(*live, Transaction.currency == home_currency)
    )  # fmt: skip

    excluded = await session.scalar(
        select(func.count()).select_from(Transaction).where(
            *live, in_range, Transaction.currency != home_currency,
            Transaction.kind.in_(("expense", "income")),
        )
    )  # fmt: skip
    return SummaryOut(
        range_start=start, range_end=end, currency=home_currency, income_minor=income,
        expense_minor=expense, net_minor=income - expense, balance_minor=int(balance or 0),
        by_category=by_category, excluded_other_currency_count=int(excluded or 0),
    )  # fmt: skip
