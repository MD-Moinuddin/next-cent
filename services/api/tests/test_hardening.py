import json
import logging
import re
import uuid
from datetime import date
from unittest.mock import patch

import pytest
from fastapi import Request
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from nextcent_api.auth import jwks_key_resolver
from nextcent_api.config import Settings
from nextcent_api.logging_config import WITHHELD, configure_logging, scrub_sentry_event
from nextcent_api.main import create_app
from nextcent_api.models import Transaction

ORIGIN = "http://localhost:8081"


async def client_for(**overrides) -> tuple[AsyncClient, object]:
    app = create_app(Settings(**overrides))
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), app


async def test_security_headers_and_request_id(anon_client):
    r = await anon_client.get("/health", headers={"X-Request-ID": "abc-123"})
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["cache-control"] == "no-store"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert r.headers["strict-transport-security"] == "max-age=31536000; includeSubDomains"
    assert r.headers["x-request-id"] == "abc-123"
    assert "x-request-id" in (await anon_client.get("/health")).headers


async def test_oversized_body_is_413_problem(anon_client):
    r = await anon_client.post("/v1/me", content=b"x" * 2_000_000)
    assert r.status_code == 413
    assert r.json()["code"] == "payload_too_large"


async def test_oversized_chunked_body_is_413_problem(app, anon_client):
    @app.post("/echo-body")
    async def echo_body(request: Request) -> int:
        return len(await request.body())

    async def chunks():
        for _ in range(3):
            yield b"x" * 600_000

    r = await anon_client.post("/echo-body", content=chunks())
    assert r.status_code == 413
    assert r.json()["code"] == "payload_too_large"


async def test_cors_allows_only_configured_origins():
    client, app = await client_for(cors_origins=[ORIGIN])
    async with client:
        ok = await client.options(
            "/v1/me",
            headers={"Origin": ORIGIN, "Access-Control-Request-Method": "GET",
                     "Access-Control-Request-Headers": "authorization"},
        )  # fmt: skip
        bad = await client.options(
            "/v1/me",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
        )
    assert ok.headers["access-control-allow-origin"] == ORIGIN
    assert "access-control-allow-origin" not in bad.headers
    await app.state.engine.dispose()


async def test_rate_limit_returns_429_problem():
    client, app = await client_for(rate_limit="3/minute")
    async with client:
        responses = [await client.get("/health") for _ in range(4)]
    assert [r.status_code for r in responses] == [200, 200, 200, 429]
    assert responses[3].json()["code"] == "rate_limited"
    assert responses[3].headers["content-type"].startswith("application/problem+json")
    retry_after = responses[3].headers["retry-after"]
    assert retry_after.isdigit() and int(retry_after) >= 1
    await app.state.engine.dispose()


async def test_429_carries_cors_headers():
    client, app = await client_for(cors_origins=[ORIGIN], rate_limit="1/minute")
    async with client:
        await client.get("/health")
        limited = await client.get("/health", headers={"Origin": ORIGIN})
    assert limited.status_code == 429
    assert limited.headers["access-control-allow-origin"] == ORIGIN
    await app.state.engine.dispose()


async def test_413_carries_cors_headers():
    client, app = await client_for(cors_origins=[ORIGIN], max_body_bytes=10)
    async with client:
        r = await client.post("/v1/me", content=b"x" * 100, headers={"Origin": ORIGIN})
    assert r.status_code == 413
    assert r.headers["access-control-allow-origin"] == ORIGIN
    await app.state.engine.dispose()


async def test_unhandled_error_log_is_json_with_request_id(app):
    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("kaboom")

    configure_logging()
    root = logging.getLogger()
    records: list[str] = []

    class Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(root.handlers[0].format(record))

    capture = Capture()
    root.addHandler(capture)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
        ) as client:
            r = await client.get("/boom")
    finally:
        root.removeHandler(capture)
    assert r.status_code == 500
    lines = [json.loads(x) for x in records]
    err = next(x for x in lines if x["message"] == "unhandled error")
    assert err["request_id"] == r.headers["x-request-id"] != "-"
    assert err["level"] == "ERROR"
    assert "kaboom" in err["exc"]


def test_configure_logging_is_idempotent():
    configure_logging()
    configure_logging()
    create_app(Settings())
    create_app(Settings())
    assert len(logging.getLogger().handlers) == 1


@pytest.mark.parametrize("secret", ["", "1234567"])
def test_short_internal_secret_is_rejected(secret):
    with pytest.raises(ValidationError):
        Settings(internal_task_secret=secret)


def test_internal_secret_of_eight_characters_is_accepted():
    assert Settings(internal_task_secret="12345678").internal_task_secret == "12345678"


@pytest.mark.parametrize("field", ["auth_issuer", "auth_jwks_url"])
def test_auth_settings_must_not_be_empty(field):
    with pytest.raises(ValidationError):
        Settings(**{field: ""})


def test_jwks_client_uses_a_short_timeout():
    with patch("nextcent_api.auth.PyJWKClient") as client_cls:
        jwks_key_resolver("https://auth.test/.well-known/jwks.json")
    assert client_cls.call_args.kwargs["timeout"] == 5


def test_sentry_not_initialised_without_dsn():
    with patch("sentry_sdk.init") as init:
        create_app(Settings())
    init.assert_not_called()


def test_sentry_initialised_without_pii_when_dsn_set():
    with patch("sentry_sdk.init") as init:
        create_app(Settings(sentry_dsn="https://key@example.invalid/1"))
    kwargs = init.call_args.kwargs
    assert kwargs == {
        "dsn": "https://key@example.invalid/1",
        "environment": "local",
        "send_default_pii": False,
        "include_local_variables": False,
        "max_request_body_size": "never",
        "traces_sample_rate": 0.0,
        "before_send": scrub_sentry_event,
    }


_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")


async def test_valid_request_id_is_echoed(anon_client):
    r = await anon_client.get("/health", headers={"X-Request-ID": "a" * 64})
    assert r.headers["x-request-id"] == "a" * 64


@pytest.mark.parametrize("supplied", ["a" * 65, "has space", "caf\u00e9", "bad\tid", "", "x" * 500])
async def test_unsafe_request_id_is_replaced(anon_client, supplied):
    value = supplied.encode("utf-8")
    r = await anon_client.get("/health", headers={"X-Request-ID": value})
    assert r.headers["x-request-id"] != supplied
    assert _ID.fullmatch(r.headers["x-request-id"])


@pytest.mark.parametrize("supplied", ["ok-id.1", "a" * 65])
async def test_request_id_rule_applies_to_500_path(app, supplied):
    @app.get("/boom2")
    async def boom2() -> None:
        raise RuntimeError("kaboom")

    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as client:
        r = await client.get("/boom2", headers={"X-Request-ID": supplied})
    assert r.status_code == 500
    rid = r.headers["x-request-id"]
    assert _ID.fullmatch(rid)
    assert (rid == supplied) == (supplied == "ok-id.1")


def test_crlf_request_id_is_replaced():
    from nextcent_api.middleware import resolve_request_id

    for bad in ["a\r\nSet-Cookie: x=1", "a\nb", "a\rb"]:
        assert resolve_request_id(bad) != bad
        assert _ID.fullmatch(resolve_request_id(bad))


@pytest.mark.parametrize("value", ["300/minute", "5/second"])
def test_valid_rate_limit_accepted(value):
    assert Settings(rate_limit=value).rate_limit == value
    create_app(Settings(rate_limit=value))


@pytest.mark.parametrize("value", ["abc", "10/century", "", "0/minute/x"])
def test_invalid_rate_limit_fails_fast(value):
    with pytest.raises(ValidationError):
        Settings(rate_limit=value)


class _Capture(logging.Handler):
    """Collects records formatted exactly as the production JSON handler would print them."""

    def __init__(self) -> None:
        super().__init__()
        self.lines: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.lines.append(logging.getLogger().handlers[0].format(record))


def _capture_logs() -> _Capture:
    configure_logging()
    capture = _Capture()
    logging.getLogger().addHandler(capture)
    return capture


async def test_database_errors_are_logged_without_sql_parameters(app):
    """Amounts, merchants and notes must not reach logs or Sentry through SQL parameter dumps."""

    @app.get("/leak")
    async def leak() -> None:
        async with app.state.sessionmaker() as session:
            session.add(
                Transaction(
                    id=uuid.uuid4(),
                    user_id=uuid.uuid4(),
                    kind="expense",
                    amount_minor=987654,
                    currency="EUR",
                    occurred_on=date(2026, 11, 1),
                    merchant="LEAKY-MERCHANT-91c2",
                )  # fmt: skip
            )
            await session.commit()  # unknown user and no category: IntegrityError

    capture = _capture_logs()
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
        ) as client:
            r = await client.get("/leak")
    finally:
        logging.getLogger().removeHandler(capture)
    assert r.status_code == 500
    text = "\n".join(capture.lines)
    assert "IntegrityError" in text  # the error itself is still logged
    assert "LEAKY-MERCHANT-91c2" not in text
    assert "987654" not in text


async def test_access_log_has_route_template_but_no_ids_or_query(client_a):
    tx_id = "123e4567-e89b-12d3-a456-426614174000"
    capture = _capture_logs()
    try:
        r = await client_a.get(f"/v1/transactions/{tx_id}?q=pharmacy")
        missing = await client_a.get("/no/such/abc123?q=pharmacy")
    finally:
        logging.getLogger().removeHandler(capture)
    access = [json.loads(x) for x in capture.lines if '"nextcent.access"' in x]
    assert len(access) == 2, capture.lines
    first, second = access
    assert first["route"] == "/v1/transactions/{tx_id}"
    assert first["method"] == "GET" and first["status"] == r.status_code == 404
    assert isinstance(first["duration_ms"], int | float) and first["duration_ms"] >= 0
    assert first["request_id"] == r.headers["x-request-id"]
    assert second["route"] == "<unmatched>" and second["status"] == missing.status_code == 404
    for line in access:
        raw = json.dumps(line)
        assert tx_id not in raw and "pharmacy" not in raw and "?" not in raw
        assert "abc123" not in raw and "127.0.0.1" not in raw
        assert set(line) == {"ts", "level", "logger", "message", "request_id", "method", "route",
                             "status", "duration_ms"}  # fmt: skip


async def test_server_logged_database_errors_are_redacted(db_session):
    """uvicorn logs the exception again after our handler; that path must be redacted too."""
    db_session.add(
        Transaction(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            kind="expense",
            amount_minor=987654,
            currency="EUR",
            occurred_on=date(2026, 11, 1),
            merchant="LEAKY-MERCHANT-91c2",
        )  # fmt: skip
    )
    capture = _capture_logs()
    try:
        try:
            await db_session.commit()
        except Exception:
            logging.getLogger("uvicorn.error").exception("Exception in ASGI application")
        await db_session.rollback()
    finally:
        logging.getLogger().removeHandler(capture)
    line = json.loads(capture.lines[-1])
    assert line["logger"] == "uvicorn.error" and "IntegrityError" in line["exc"]
    assert "ck_tx_expense_category" in line["exc"]  # the constraint name helps debugging
    assert "LEAKY-MERCHANT-91c2" not in line["exc"] and "987654" not in line["exc"]
    assert not logging.getLogger("uvicorn").handlers


def test_sentry_events_withhold_database_error_messages():
    event = {
        "exception": {
            "values": [
                {"module": "asyncpg.exceptions", "type": "CheckViolationError",
                 "value": "Failing row contains (..., 987654, LEAKY)"},
                {"module": "sqlalchemy.exc", "type": "IntegrityError", "value": "LEAKY"},
                {"module": "builtins", "type": "RuntimeError", "value": "kaboom"},
            ]
        }
    }  # fmt: skip
    values = scrub_sentry_event(event, {})["exception"]["values"]
    assert [v["value"] for v in values] == [WITHHELD, WITHHELD, "kaboom"]
