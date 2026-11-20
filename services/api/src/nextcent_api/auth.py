import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

import jwt
from jwt import PyJWKClient
from pydantic import BaseModel, Field

from nextcent_api.errors import ProblemError

KeyResolver = Callable[[str], Awaitable[Any]]
JWKS_TIMEOUT_SECONDS = 5


class Claims(BaseModel):
    sub: str = Field(min_length=1, max_length=255)
    email: str | None = None


def jwks_key_resolver(jwks_url: str) -> KeyResolver:
    # A short timeout keeps a slow or unreachable JWKS endpoint from tying up worker threads.
    client = PyJWKClient(jwks_url, cache_keys=True, timeout=JWKS_TIMEOUT_SECONDS)

    async def resolve(token: str) -> Any:
        signing_key = await asyncio.to_thread(client.get_signing_key_from_jwt, token)
        return signing_key.key

    return resolve


class TokenVerifier:
    def __init__(self, key_resolver: KeyResolver, issuer: str, audience: str | None = None) -> None:
        self._resolve = key_resolver
        self._issuer = issuer
        self._audience = audience

    async def verify(self, token: str) -> Claims:
        try:
            key = await self._resolve(token)
            payload = jwt.decode(
                token,
                key,
                algorithms=["RS256", "ES256"],
                issuer=self._issuer,
                audience=self._audience,
                options={
                    "require": ["exp", "sub", "iss"],
                    "verify_aud": self._audience is not None,
                },
            )
            # ValueError covers pydantic.ValidationError (empty or oversized sub) and
            # JSONDecodeError from a bad JWKS body; OSError covers network read failures.
            return Claims(sub=payload["sub"], email=payload.get("email"))
        except (jwt.PyJWTError, ValueError, OSError) as exc:
            raise ProblemError(
                401,
                "invalid_token",
                "Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc
