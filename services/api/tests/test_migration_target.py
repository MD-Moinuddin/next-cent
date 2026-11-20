from pathlib import Path

from nextcent_api.migration_target import (
    DEFAULT_DATABASE_URL,
    describe_target,
    resolve_database_url,
)

ENV_URL = "postgresql+asyncpg://u:envpw@h1:5433/from_env"
FILE_URL = "postgresql+asyncpg://u:filepw@h2:5433/from_file"


def write_env(tmp_path: Path, text: str) -> Path:
    p = tmp_path / ".env"
    p.write_text(text)
    return p


def test_env_var_wins_over_file(tmp_path: Path) -> None:
    f = write_env(tmp_path, f"NEXTCENT_DATABASE_URL={FILE_URL}\n")
    assert resolve_database_url({"NEXTCENT_DATABASE_URL": ENV_URL}, f) == (ENV_URL, "env var")


def test_file_used_when_no_env_var(tmp_path: Path) -> None:
    f = write_env(tmp_path, f"NEXTCENT_DATABASE_URL={FILE_URL}\n")
    assert resolve_database_url({}, f) == (FILE_URL, str(f))


def test_empty_env_var_falls_through(tmp_path: Path) -> None:
    f = write_env(tmp_path, f"NEXTCENT_DATABASE_URL={FILE_URL}\n")
    assert resolve_database_url({"NEXTCENT_DATABASE_URL": " "}, f)[0] == FILE_URL


def test_default_when_nothing_set(tmp_path: Path) -> None:
    assert resolve_database_url({}, tmp_path / "missing.env") == (DEFAULT_DATABASE_URL, "default")


def test_file_without_key_uses_default(tmp_path: Path) -> None:
    f = write_env(tmp_path, "NEXTCENT_AUTH_ISSUER=x\n")
    assert resolve_database_url({}, f) == (DEFAULT_DATABASE_URL, "default")


def test_comments_blank_lines_and_quotes(tmp_path: Path) -> None:
    f = write_env(
        tmp_path,
        "# a comment\n\n# NEXTCENT_DATABASE_URL=ignored\nOTHER=1\n"
        f'NEXTCENT_DATABASE_URL="{FILE_URL}"\n',
    )
    assert resolve_database_url({}, f)[0] == FILE_URL
    g = write_env(tmp_path, f"NEXTCENT_DATABASE_URL='{FILE_URL}'  # trailing\n")
    assert resolve_database_url({}, g)[0] == FILE_URL


def test_commented_key_only_is_ignored(tmp_path: Path) -> None:
    f = write_env(tmp_path, f"# NEXTCENT_DATABASE_URL={FILE_URL}\n")
    assert resolve_database_url({}, f)[1] == "default"


def test_message_names_database_and_never_the_password() -> None:
    msg = describe_target(ENV_URL, "env var")
    assert msg == "alembic: using database 'from_env' on h1:5433 (source: env var)"
    assert "envpw" not in msg
