import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from nextcent_api.logging_config import request_id_var

logger = logging.getLogger("nextcent.errors")
PROBLEM_JSON = "application/problem+json"


class ProblemError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        title: str,
        detail: str | None = None,
        extra: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(title)
        self.status, self.code, self.title, self.detail = status, code, title, detail
        self.extra = extra or {}
        self.headers = headers


def problem_response(
    status: int,
    code: str,
    title: str,
    detail: str | None = None,
    extra: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "type": f"urn:nextcent:problem:{code}",
        "title": title,
        "status": status,
        "code": code,
    }
    if detail:
        body["detail"] = detail
    body.update(extra or {})
    return JSONResponse(body, status_code=status, media_type=PROBLEM_JSON, headers=headers)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ProblemError)
    async def _problem(_: Request, exc: ProblemError) -> JSONResponse:
        return problem_response(exc.status, exc.code, exc.title, exc.detail, exc.extra, exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]}
            for e in jsonable_encoder(exc.errors())
        ]
        return problem_response(
            422, "validation_error", "Validation failed", extra={"errors": errors}
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "not_found", 405: "method_not_allowed", 401: "unauthorized"}.get(
            exc.status_code, "http_error"
        )
        return problem_response(
            exc.status_code, code, str(exc.detail), headers=dict(exc.headers or {})
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # ServerErrorMiddleware sits outside our middleware, so the request id context
        # variable is already reset here: restore it from the request state.
        request_id = getattr(request.state, "request_id", None)
        token = request_id_var.set(request_id) if request_id else None
        try:
            logger.exception("unhandled error", exc_info=exc)
        finally:
            if token is not None:
                request_id_var.reset(token)
        headers = {"X-Request-ID": request_id} if request_id else None
        return problem_response(500, "internal_error", "Internal server error", headers=headers)
