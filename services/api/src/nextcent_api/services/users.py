import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from nextcent_api.clock import utcnow
from nextcent_api.models import Category, User

DEFAULT_CATEGORIES: list[tuple[str, str]] = [
    ("Groceries", "🛒"), ("Dining", "🍔"), ("Transport", "🚌"), ("Housing", "🏠"),
    ("Utilities", "💡"), ("Health", "❤️"), ("Shopping", "🛍️"), ("Entertainment", "🎬"),
    ("Travel", "✈️"), ("Subscriptions", "🔁"), ("Education", "📚"), ("Other", "🗂️"),
]  # fmt: skip


async def get_or_create_user(session: AsyncSession, auth_subject: str) -> User:
    user = await session.scalar(select(User).where(User.auth_subject == auth_subject))
    if user is not None:
        return user
    new_id = await session.scalar(
        pg_insert(User)
        .values(
            id=uuid.uuid4(),
            auth_subject=auth_subject,
            home_currency="USD",
            created_at=utcnow(),
        )
        .on_conflict_do_nothing(index_elements=["auth_subject"])
        .returning(User.id)
    )
    if new_id is not None:
        session.add_all(Category(user_id=new_id, name=n, icon=i) for n, i in DEFAULT_CATEGORIES)
        await session.commit()
    user = await session.scalar(select(User).where(User.auth_subject == auth_subject))
    if user is None:
        raise RuntimeError("user provisioning failed")
    return user
