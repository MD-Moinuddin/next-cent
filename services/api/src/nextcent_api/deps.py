from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from nextcent_api.db import get_session
from nextcent_api.errors import ProblemError
from nextcent_api.models import User
from nextcent_api.services.users import get_or_create_user

_bearer = HTTPBearer(auto_error=False)

Session = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(
    request: Request,
    session: Session,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise ProblemError(
            401,
            "missing_token",
            "Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    claims = await request.app.state.verifier.verify(credentials.credentials)
    return await get_or_create_user(session, claims.sub)


CurrentUser = Annotated[User, Depends(get_current_user)]
