import asyncio

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from nextcent_api.deps import CurrentUser
from nextcent_api.models import Category, User
from nextcent_api.services.users import DEFAULT_CATEGORIES


def add_whoami(app: FastAPI) -> None:
    @app.get("/_whoami")
    async def whoami(user: CurrentUser) -> dict[str, str]:
        return {"auth_subject": user.auth_subject, "currency": user.home_currency}


async def test_missing_token_is_401(app: FastAPI):
    add_whoami(app)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/_whoami")
    assert r.status_code == 401 and r.json()["code"] == "missing_token"
    assert r.headers["www-authenticate"] == "Bearer"


async def test_405_keeps_allow_header(anon_client: AsyncClient):
    r = await anon_client.post("/health")
    assert r.status_code == 405
    assert "GET" in r.headers["allow"]


async def test_first_request_provisions_user_and_categories(app, client_a, db_session):
    add_whoami(app)
    r = await client_a.get("/_whoami")
    assert r.status_code == 200 and r.json()["auth_subject"] == "user-a"
    assert r.json()["currency"] == "USD"
    count = await db_session.scalar(select(func.count()).select_from(Category))
    assert count == len(DEFAULT_CATEGORIES) == 12


async def test_repeat_and_concurrent_first_requests_create_one_user(app, client_a, db_session):
    add_whoami(app)
    results = await asyncio.gather(*[client_a.get("/_whoami") for _ in range(5)])
    assert all(r.status_code == 200 for r in results)
    assert await db_session.scalar(select(func.count()).select_from(User)) == 1
    assert await db_session.scalar(select(func.count()).select_from(Category)) == 12


# ---- Fix round 1: hardening tests ----
import base64  # noqa: E402
import hmac  # noqa: E402
import json  # noqa: E402
import time  # noqa: E402

import jwt  # noqa: E402
import pytest  # noqa: E402
from cryptography.hazmat.primitives import serialization  # noqa: E402
from jwt.exceptions import PyJWKClientError  # noqa: E402

from nextcent_api import auth  # noqa: E402
from nextcent_api.auth import TokenVerifier, jwks_key_resolver  # noqa: E402
from nextcent_api.errors import ProblemError  # noqa: E402
from nextcent_api.main import create_app  # noqa: E402

ISS = "https://auth.test"


def assert_invalid(r) -> None:
    assert r.status_code == 401
    assert r.json()["code"] == "invalid_token"
    assert r.headers["www-authenticate"] == "Bearer"


async def get_with(app: FastAPI, token: str):
    add_whoami(app)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        return await c.get("/_whoami", headers={"Authorization": f"Bearer {token}"})


async def test_garbage_token_is_invalid(app: FastAPI):
    assert_invalid(await get_with(app, "not-a-jwt"))


async def test_expired_token_is_invalid(app: FastAPI, make_token):
    assert_invalid(await get_with(app, make_token(exp=1)))


async def test_wrong_issuer_is_invalid(app: FastAPI, make_token):
    assert_invalid(await get_with(app, make_token(iss="https://evil")))


@pytest.mark.parametrize("missing", ["exp", "sub", "iss"])
async def test_token_missing_required_claim_is_invalid(app: FastAPI, rsa_key, missing):
    claims = {"sub": "u", "iss": ISS, "exp": int(time.time()) + 3600}
    del claims[missing]
    token = jwt.encode(claims, rsa_key, algorithm="RS256")
    assert_invalid(await get_with(app, token))


@pytest.mark.parametrize("sub", ["", "x" * 300])
async def test_empty_or_oversized_sub_is_invalid(app: FastAPI, make_token, sub):
    assert_invalid(await get_with(app, make_token(sub)))


async def test_sub_of_255_chars_is_accepted(app: FastAPI, make_token):
    r = await get_with(app, make_token("x" * 255))
    assert r.status_code == 200


async def test_basic_auth_header_is_missing_token(app: FastAPI):
    add_whoami(app)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/_whoami", headers={"Authorization": "Basic abc"})
    assert r.status_code == 401 and r.json()["code"] == "missing_token"


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


async def test_hs256_with_public_key_as_secret_is_rejected(app: FastAPI, rsa_key):
    pem = rsa_key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = b64(json.dumps({"sub": "u", "iss": ISS, "exp": int(time.time()) + 3600}).encode())
    sig = b64(hmac.new(pem, f"{header}.{body}".encode(), "sha256").digest())
    assert_invalid(await get_with(app, f"{header}.{body}.{sig}"))


async def test_alg_none_token_is_rejected(app: FastAPI):
    header = b64(json.dumps({"alg": "none", "typ": "JWT"}).encode())
    body = b64(json.dumps({"sub": "u", "iss": ISS, "exp": int(time.time()) + 3600}).encode())
    assert_invalid(await get_with(app, f"{header}.{body}."))


def audience_app(rsa_key, audience: str | None) -> FastAPI:
    async def resolve(_: str) -> object:
        return rsa_key.public_key()

    return create_app(verifier=TokenVerifier(resolve, issuer=ISS, audience=audience))


async def test_audience_enforced_when_configured(rsa_key, make_token):
    app = audience_app(rsa_key, "nextcent")
    try:
        assert_invalid(await get_with(app, make_token()))
        assert_invalid(await get_with(app, make_token(aud="other")))
        assert (await get_with(app, make_token(aud="nextcent"))).status_code == 200
    finally:
        await app.state.engine.dispose()


async def test_audience_not_checked_when_not_configured(rsa_key, make_token):
    app = audience_app(rsa_key, None)
    try:
        assert (await get_with(app, make_token())).status_code == 200
        assert (await get_with(app, make_token(aud="anything"))).status_code == 200
    finally:
        await app.state.engine.dispose()


@pytest.mark.parametrize(
    "error", [PyJWKClientError("no key"), ValueError("bad jwks json"), OSError("read failed")]
)
async def test_jwks_resolver_errors_map_to_401(monkeypatch, make_token, error):
    class FakeClient:
        def __init__(self, *_a: object, **_k: object) -> None: ...

        def get_signing_key_from_jwt(self, _token: str):
            raise error

    monkeypatch.setattr(auth, "PyJWKClient", FakeClient)
    verifier = TokenVerifier(jwks_key_resolver("https://auth.test/jwks"), issuer=ISS)
    with pytest.raises(ProblemError) as exc:
        await verifier.verify(make_token())
    assert exc.value.status == 401 and exc.value.code == "invalid_token"
    assert exc.value.headers == {"WWW-Authenticate": "Bearer"}


async def test_empty_audience_setting_accepts_token_without_aud(monkeypatch, rsa_key, make_token):
    from nextcent_api import main
    from nextcent_api.config import Settings

    async def resolve(_: str) -> object:
        return rsa_key.public_key()

    monkeypatch.setattr(main, "jwks_key_resolver", lambda _url: resolve)
    settings = Settings(
        _env_file=None,
        auth_issuer=ISS,
        auth_jwks_url="https://auth.test/j",
        auth_audience="",
        internal_task_secret="test-secret",
    )
    app = create_app(settings=settings)
    try:
        assert (await get_with(app, make_token())).status_code == 200
    finally:
        await app.state.engine.dispose()
