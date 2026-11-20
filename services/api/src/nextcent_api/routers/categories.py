import uuid

from fastapi import APIRouter
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from nextcent_api.clock import utcnow
from nextcent_api.deps import CurrentUser, Session
from nextcent_api.errors import ProblemError
from nextcent_api.models import Category
from nextcent_api.schemas.categories import CategoryIn, CategoryOut, CategoryPatch

router = APIRouter(prefix="/categories", tags=["categories"])
NAME_TAKEN = "A category with this name already exists"


async def _commit_or_conflict(session: Session) -> None:
    # The pre-check in _name_taken can race with a concurrent write; the partial unique
    # index uq_category_active_name is the authority, so map its violation to 409.
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise ProblemError(409, "category_exists", NAME_TAKEN) from None


async def _name_taken(
    session: Session, user_id: uuid.UUID, name: str, exclude: uuid.UUID | None
) -> bool:
    stmt = (
        select(func.count())
        .select_from(Category)
        .where(
            Category.user_id == user_id,
            func.lower(Category.name) == name.lower(),
            Category.archived_at.is_(None),
        )
    )
    if exclude:
        stmt = stmt.where(Category.id != exclude)
    return bool(await session.scalar(stmt))


@router.get("", response_model=list[CategoryOut], operation_id="list_categories")
async def list_categories(
    user: CurrentUser, session: Session, include_archived: bool = False
) -> list[Category]:
    stmt = select(Category).where(Category.user_id == user.id).order_by(Category.name)
    if not include_archived:
        stmt = stmt.where(Category.archived_at.is_(None))
    return list((await session.scalars(stmt)).all())


@router.post("", response_model=CategoryOut, status_code=201, operation_id="create_category")
async def create_category(body: CategoryIn, user: CurrentUser, session: Session) -> Category:
    if await _name_taken(session, user.id, body.name, None):
        raise ProblemError(409, "category_exists", NAME_TAKEN)
    category = Category(user_id=user.id, name=body.name, icon=body.icon, color=body.color)
    session.add(category)
    await _commit_or_conflict(session)
    return category


@router.patch("/{category_id}", response_model=CategoryOut, operation_id="patch_category")
async def patch_category(
    category_id: uuid.UUID, body: CategoryPatch, user: CurrentUser, session: Session
) -> Category:
    category = await session.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user.id)
    )
    if category is None:
        raise ProblemError(404, "category_not_found", "Category not found")
    new_name = body.name or category.name
    becoming_active = body.archived is False or (
        body.archived is None and category.archived_at is None
    )
    if becoming_active and await _name_taken(session, user.id, new_name, category.id):
        raise ProblemError(409, "category_exists", NAME_TAKEN)
    if body.name:
        category.name = body.name
    if body.icon:
        category.icon = body.icon
    if body.color is not None:
        category.color = body.color
    if body.archived is True and category.archived_at is None:
        category.archived_at = utcnow()
    elif body.archived is False:
        category.archived_at = None
    await _commit_or_conflict(session)
    return category
