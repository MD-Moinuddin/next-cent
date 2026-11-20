import pytest

from nextcent_api.config import Settings

BASE = {
    "auth_issuer": "https://auth.test",
    "auth_jwks_url": "https://auth.test/j",
    "internal_task_secret": "test-secret",
}


@pytest.mark.parametrize("raw", ["", "   ", "\t"])
def test_blank_audience_is_normalised_to_none(raw: str) -> None:
    assert Settings(_env_file=None, auth_audience=raw, **BASE).auth_audience is None


def test_blank_audience_from_environment_is_none(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NEXTCENT_AUTH_AUDIENCE", "")
    assert Settings(_env_file=None, **BASE).auth_audience is None


def test_real_audience_is_kept_stripped() -> None:
    assert Settings(_env_file=None, auth_audience="  nextcent ", **BASE).auth_audience == "nextcent"


def test_missing_audience_is_none() -> None:
    assert Settings(_env_file=None, **BASE).auth_audience is None
