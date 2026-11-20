from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from nextcent_api.deps import CurrentUser, Session
from nextcent_api.errors import ProblemError
from nextcent_api.schemas.summary import SummaryOut
from nextcent_api.services.summary import compute_summary

router = APIRouter(prefix="/summary", tags=["summary"])
MAX_SPAN_DAYS = 3660


@router.get("", response_model=SummaryOut, operation_id="get_summary")
async def get_summary(
    user: CurrentUser,
    session: Session,
    from_: Annotated[date, Query(alias="from")],
    to: date,
) -> SummaryOut:
    if from_ > to or (to - from_).days > MAX_SPAN_DAYS:
        raise ProblemError(422, "invalid_range", "Invalid date range")
    return await compute_summary(session, user.id, user.home_currency, from_, to)
