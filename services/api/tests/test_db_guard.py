import pytest

from tests.db_guard import assert_test_database


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+asyncpg://nextcent:nextcent@localhost:5433/nextcent_test",
        "postgresql+asyncpg://u:p@db:5432/ci_test",
    ],
)
def test_test_databases_are_accepted(url):
    assert_test_database(url)


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+asyncpg://nextcent:nextcent@localhost:5433/nextcent",
        "postgresql+asyncpg://u:p@host/production",
        "postgresql+asyncpg://u:p@host/test_nextcent",
        "postgresql+asyncpg://u:p@host/",
    ],
)
def test_other_databases_are_refused(url):
    with pytest.raises(RuntimeError, match="must end with '_test'"):
        assert_test_database(url)
