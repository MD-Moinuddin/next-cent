import logging
import math
import re
import time
import uuid
from collections.abc import Awaitable, Callable

from limits import parse
from limits.storage import MemoryStorage
from limits.strategies import FixedWindowRateLimiter
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from nextcent_api.errors import problem_response
from nextcent_api.logging_config import request_id_var

REQUEST_ID_PATTERN = re.compile(r"[A-Za-z0-9._-]{1,64}")


def resolve_request_id(supplied: str | None) -> str:
    """Accept a client id only if it is short and safe; otherwise generate one."""
    if supplied is not None and REQUEST_ID_PATTERN.fullmatch(supplied):
        return supplied
    return uuid.uuid4().hex


class _TooLarge(Exception):
    pass


class BodySizeLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app, self.max_bytes = app, max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = dict(scope["headers"])
        declared = headers.get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > self.max_bytes:
            await self._reject(scope, receive, send)
            return
        received, started = 0, False

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _TooLarge
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal started
            started = started or message["type"] == "http.response.start"
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except _TooLarge:
            if not started:
                await self._reject(scope, receive, send)

    async def _reject(self, scope: Scope, receive: Receive, send: Send) -> None:
        response = problem_response(413, "payload_too_large", "Request body too large")
        await response(scope, receive, send)


class RateLimitMiddleware:
    """Per-client-IP fixed-window limit, e.g. "300/minute". State is per app instance.

    Pure ASGI on purpose: it does not depend on route introspection, so every path
    (including /health) is counted. Behind a proxy run uvicorn with --proxy-headers.
    """

    def __init__(self, app: ASGIApp, rate_limit: str) -> None:
        self.app = app
        self.item = parse(rate_limit)
        self.limiter = FixedWindowRateLimiter(MemoryStorage())

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        client = scope.get("client")
        key = client[0] if client else "unknown"
        if not self.limiter.hit(self.item, key):
            reset = self.limiter.get_window_stats(self.item, key).reset_time
            retry_after = max(1, math.ceil(reset - time.time()))
            response = problem_response(
                429, "rate_limited", "Too many requests", headers={"Retry-After": str(retry_after)}
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = resolve_request_id(request.headers.get("x-request-id"))
        request.state.request_id = request_id
        token = request_id_var.set(request_id)
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = request_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Cache-Control", "no-store")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        # Browsers ignore HSTS over plain HTTP, so this is harmless in local development.
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
        return response


access_logger = logging.getLogger("nextcent.access")
UNMATCHED_ROUTE = "<unmatched>"


def route_template(scope: Scope) -> str:
    """The matched route with every path parameter replaced by its name, e.g.
    `/v1/transactions/{tx_id}`. Never the raw path (ids) or the query string (search terms)."""
    if scope.get("route") is None:
        return UNMATCHED_ROUTE
    by_value = {str(v): k for k, v in (scope.get("path_params") or {}).items()}
    segments = str(scope.get("path", "")).split("/")
    return "/".join("{" + by_value[seg] + "}" if seg in by_value else seg for seg in segments)


class AccessLogMiddleware:
    """One JSON line per request: method, route template, status, duration, request id.

    Replaces uvicorn's access log (run with --no-access-log), which prints client IPs and the full
    query string. Pure ASGI so it also sees responses produced by the inner limit middlewares.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = time.perf_counter()
        status = 500  # an exception before the response started becomes a 500

        async def capture_status(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, capture_status)
        finally:
            access_logger.info(
                "request",
                extra={
                    "fields": {
                        "method": scope.get("method", ""),
                        "route": route_template(scope),
                        "status": status,
                        "duration_ms": round((time.perf_counter() - started) * 1000, 1),
                    }
                },
            )
