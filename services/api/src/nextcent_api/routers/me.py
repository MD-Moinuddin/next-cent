from fastapi import APIRouter, Response
from sqlalchemy import delete

from nextcent_api.deps import CurrentUser, Session
from nextcent_api.models import User
from nextcent_api.schemas.me import MeOut, MePatch
from nextcent_api.services import profile

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=MeOut, operation_id="get_me")
async def get_me(user: CurrentUser, session: Session) -> MeOut:
    return await profile.get_profile(session, user)


@router.patch("", response_model=MeOut, operation_id="patch_me")
async def patch_me(body: MePatch, user: CurrentUser, session: Session) -> MeOut:
    return await profile.patch_profile(session, user, body)


@router.delete("", status_code=204, operation_id="delete_me")
async def delete_me(user: CurrentUser, session: Session) -> Response:
    await session.execute(delete(User).where(User.id == user.id))  # DB cascades all owned data
    await session.commit()
    return Response(status_code=204)
