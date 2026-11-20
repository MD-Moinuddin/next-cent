from fastapi import APIRouter, Response

from nextcent_api.deps import CurrentUser, Session
from nextcent_api.services.export import build_csv

router = APIRouter(tags=["export"])


@router.get("/export.csv", operation_id="export_csv", response_class=Response)
async def export_csv(user: CurrentUser, session: Session) -> Response:
    content = await build_csv(session, user.id)
    return Response(
        content=content.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="nextcent-export.csv"'},
    )
