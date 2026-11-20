from sqlalchemy.engine import make_url


def assert_test_database(url: str) -> None:
    """Refuse to reset any database whose name does not end with `_test`.

    The test session runs `alembic downgrade base`, which drops every table: pointing
    NEXTCENT_TEST_DATABASE_URL at a real database by mistake must fail before that happens.
    """
    name = make_url(url).database or ""
    if not name.endswith("_test"):
        raise RuntimeError(
            f"Refusing to run the test suite against database {name!r}: its name must end with "
            "'_test' because the tests drop and recreate every table."
        )
