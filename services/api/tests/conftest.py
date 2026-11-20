import os
import subprocess
import sys
import time
from collections.abc import AsyncIterator, Callable
from pathlib import Path

os.environ["NEXTCENT_DATABASE_URL"] = os.environ.get(
    "NEXTCENT_TEST_DATABASE_URL",
    "postgresql+asyncpg://nextcent:nextcent@localhost:5433/nextcent_test",
)
os.environ.setdefault("NEXTCENT_AUTH_ISSUER", "https://auth.test")
os.environ.setdefault("NEXTCENT_AUTH_JWKS_URL", "https://auth.test/.well-known/jwks.json")
os.environ.setdefault("NEXTCENT_INTERNAL_TASK_SECRET", "test-secret")

import jwt  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from nextcent_api.auth import TokenVerifier  # noqa: E402
from nextcent_api.main import create_app  # noqa: E402
from tests.db_guard import assert_test_database  # noqa: E402

API_DIR = Path(__file__).resolve().parents[1]
ISSUER = "https://auth.test"


@pytest.fixture(scope="session", autouse=True)
def _migrated_database() -> None:
    assert_test_database(os.environ["NEXTCENT_DATABASE_URL"])  # before anything is dropped
    subprocess.run([sys.executable, "-m", "alembic", "downgrade", "base"], check=True, cwd=API_DIR)
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True, cwd=API_DIR)


@pytest_asyncio.fixture(scope="session")
async def engine() -> AsyncIterator[AsyncEngine]:
    eng = create_async_engine(os.environ["NEXTCENT_DATABASE_URL"])
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _clean_db(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE transaction_tags, tags, transactions, recurring_rules, "
                "categories, users CASCADE"
            )
        )


@pytest_asyncio.fixture
async def db_session(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        yield session


@pytest.fixture(scope="session")
def rsa_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(scope="session")
def make_token(rsa_key: rsa.RSAPrivateKey) -> Callable[..., str]:
    def _make(subject: str = "user-a", **overrides: object) -> str:
        claims = {"sub": subject, "iss": ISSUER, "exp": int(time.time()) + 3600, **overrides}
        return jwt.encode(claims, rsa_key, algorithm="RS256")

    return _make


@pytest_asyncio.fixture
async def app(rsa_key: rsa.RSAPrivateKey) -> AsyncIterator[FastAPI]:
    async def resolve(_: str) -> object:
        return rsa_key.public_key()

    application = create_app(verifier=TokenVerifier(resolve, issuer=ISSUER))
    yield application
    await application.state.engine.dispose()


@pytest_asyncio.fixture
async def auth_client(
    app: FastAPI, make_token: Callable[..., str]
) -> AsyncIterator[Callable[[str], AsyncClient]]:
    clients: list[AsyncClient] = []

    def _client_for(subject: str) -> AsyncClient:
        c = AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": f"Bearer {make_token(subject)}"},
        )
        clients.append(c)
        return c

    yield _client_for
    for c in clients:
        await c.aclose()


@pytest.fixture
def client_a(auth_client: Callable[[str], AsyncClient]) -> AsyncClient:
    return auth_client("user-a")


@pytest.fixture
def client_b(auth_client: Callable[[str], AsyncClient]) -> AsyncClient:
    return auth_client("user-b")


@pytest_asyncio.fixture
async def anon_client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
