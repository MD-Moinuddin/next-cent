from functools import lru_cache

from limits import parse
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="NEXTCENT_", extra="ignore")

    database_url: str = "postgresql+asyncpg://nextcent:nextcent@localhost:5433/nextcent"
    auth_issuer: str = Field(min_length=1)
    auth_jwks_url: str = Field(min_length=1)
    auth_audience: str | None = None
    cors_origins: list[str] = []
    internal_task_secret: str = Field(min_length=8)
    environment: str = "local"
    rate_limit: str = "300/minute"
    max_body_bytes: int = 1_048_576
    sentry_dsn: str | None = None

    @field_validator("auth_audience")
    @classmethod
    def _blank_audience_is_unset(cls, value: str | None) -> str | None:
        # `NEXTCENT_AUTH_AUDIENCE=` in an env file must behave like unset, not "verify aud".
        if value is None or not value.strip():
            return None
        return value.strip()

    @field_validator("rate_limit")
    @classmethod
    def _valid_rate_limit(cls, value: str) -> str:
        try:
            parse(value)
        except ValueError as exc:
            raise ValueError(f"invalid rate limit {value!r}") from exc
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
