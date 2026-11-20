"""Resolve which database Alembic migrates, and describe it without leaking the password."""

from collections.abc import Mapping
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy.engine import make_url

ENV_VAR = "NEXTCENT_DATABASE_URL"
DEFAULT_DATABASE_URL = "postgresql+asyncpg://nextcent:nextcent@localhost:5433/nextcent"


def resolve_database_url(environ: Mapping[str, str], env_file_path: Path) -> tuple[str, str]:
    """Return (url, source). Order: environment variable, the .env file, the default.

    Only the one key is read from the file (the full Settings needs unrelated auth variables).
    An empty value counts as unset.
    """
    from_env = (environ.get(ENV_VAR) or "").strip()
    if from_env:
        return from_env, "env var"
    if env_file_path.is_file():
        from_file = (dotenv_values(env_file_path).get(ENV_VAR) or "").strip()
        if from_file:
            return from_file, f"{env_file_path}"
    return DEFAULT_DATABASE_URL, "default"


def describe_target(url: str, source: str) -> str:
    parsed = make_url(url)
    host = parsed.host or "(unix socket)"
    port = f":{parsed.port}" if parsed.port else ""
    return f"alembic: using database '{parsed.database}' on {host}{port} (source: {source})"
