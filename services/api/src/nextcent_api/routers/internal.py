import secrets
from typing import Annotated

from fastapi import APIRouter, Header, Request

from nextcent_api.clock import utcnow
from nextcent_api.deps import Session
from nextcent_api.errors import ProblemError
from nextcent_api.services.recurring import generate_due_transactions

router = APIRouter(prefix="/internal", include_in_schema=False)


@router.post("/tasks/generate-recurring")
async def generate_recurring(
    request: Request,
    session: Session,
    x_internal_secret: Annotated[str | None, Header()] = None,
) -> dict[str, int]:
    expected = request.app.state.settings.internal_task_secret.encode()
    if x_internal_secret is None or not secrets.compare_digest(
        x_internal_secret.encode(), expected
    ):
        raise ProblemError(403, "forbidden", "Forbidden")
    result = await generate_due_transactions(session, utcnow().date())
    return {"created": result.created, "failed": result.failed}
