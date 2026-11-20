from fastapi import APIRouter
from sqlalchemy import text

from nextcent_api.deps import Session

router = APIRouter(tags=["health"])


@router.get("/health", operation_id="health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready", operation_id="health_ready")
async def ready(session: Session) -> dict[str, str]:
    await session.execute(text("SELECT 1"))
    return {"status": "ready"}
