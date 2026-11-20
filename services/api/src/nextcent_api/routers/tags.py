import uuid

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, select

from nextcent_api.deps import CurrentUser, Session
from nextcent_api.models import Tag

router = APIRouter(prefix="/tags", tags=["tags"])


class TagOut(BaseModel):
    id: uuid.UUID
    name: str


@router.get("", response_model=list[TagOut], operation_id="list_tags")
async def list_tags(user: CurrentUser, session: Session) -> list[TagOut]:
    rows = await session.scalars(
        select(Tag).where(Tag.user_id == user.id).order_by(func.lower(Tag.name))
    )
    return [TagOut(id=t.id, name=t.name) for t in rows]
