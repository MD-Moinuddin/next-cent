import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response

from nextcent_api.deps import CurrentUser, Session
from nextcent_api.schemas.common import Page
from nextcent_api.schemas.transactions import TransactionIn, TransactionOut
from nextcent_api.services import transactions as svc

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get(
    "/changes", response_model=Page[TransactionOut], operation_id="list_transaction_changes"
)
async def list_transaction_changes(
    user: CurrentUser,
    session: Session,
    since: datetime,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> Page[TransactionOut]:
    rows, next_cursor = await svc.changes(session, user.id, since=since, cursor=cursor, limit=limit)
    return Page(items=[TransactionOut.from_model(t) for t in rows], next_cursor=next_cursor)


@router.get("", response_model=Page[TransactionOut], operation_id="list_transactions")
async def list_transactions(
    user: CurrentUser,
    session: Session,
    from_: Annotated[date | None, Query(alias="from")] = None,
    to: date | None = None,
    category_id: uuid.UUID | None = None,
    kind: Literal["expense", "income"] | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> Page[TransactionOut]:
    rows, next_cursor = await svc.browse(
        session, user.id, from_=from_, to=to, category_id=category_id, kind=kind, q=q,
        cursor=cursor, limit=limit,
    )  # fmt: skip
    return Page(items=[TransactionOut.from_model(t) for t in rows], next_cursor=next_cursor)


@router.get("/{tx_id}", response_model=TransactionOut, operation_id="get_transaction")
async def get_transaction(tx_id: uuid.UUID, user: CurrentUser, session: Session) -> TransactionOut:
    return TransactionOut.from_model(await svc.get_owned(session, user.id, tx_id))


@router.put(
    "/{tx_id}",
    response_model=TransactionOut,
    responses={201: {"model": TransactionOut}},
    operation_id="put_transaction",
)
async def put_transaction(
    tx_id: uuid.UUID, body: TransactionIn, response: Response, user: CurrentUser, session: Session
) -> TransactionOut:
    user_id = user.id
    tx, created = await svc.upsert_transaction(session, user_id, tx_id, body)
    await session.commit()
    response.status_code = 201 if created else 200
    return TransactionOut.from_model(tx)


@router.delete("/{tx_id}", status_code=204, operation_id="delete_transaction")
async def delete_transaction(tx_id: uuid.UUID, user: CurrentUser, session: Session) -> Response:
    await svc.soft_delete(session, user.id, tx_id)
    await session.commit()
    return Response(status_code=204)


@router.post("/{tx_id}/restore", response_model=TransactionOut, operation_id="restore_transaction")
async def restore_transaction(
    tx_id: uuid.UUID, user: CurrentUser, session: Session
) -> TransactionOut:
    tx = await svc.restore(session, user.id, tx_id)
    await session.commit()
    return TransactionOut.from_model(tx)
