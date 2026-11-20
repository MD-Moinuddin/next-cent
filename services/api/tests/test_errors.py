from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel

from nextcent_api.errors import ProblemError


async def test_unknown_route_is_problem_json(anon_client):
    r = await anon_client.get("/nope")
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("application/problem+json")
    body = r.json()
    assert body["status"] == 404 and body["code"] == "not_found"


async def test_problem_error_shape_and_extra(app: FastAPI):
    @app.get("/_boom")
    async def boom() -> None:
        raise ProblemError(
            409, "version_conflict", "Version conflict", "stale", {"current_version": 3}
        )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.get("/_boom")
    assert r.status_code == 409
    body = r.json()
    assert body["code"] == "version_conflict" and body["current_version"] == 3
    assert body["type"] == "urn:nextcent:problem:version_conflict"


async def test_validation_error_is_422_problem(app: FastAPI):
    class Body(BaseModel):
        n: int

    @app.post("/_v")
    async def v(body: Body) -> dict[str, int]:
        return {"n": body.n}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        r = await c.post("/_v", json={"n": "x"})
    assert r.status_code == 422
    assert r.json()["code"] == "validation_error"
    assert r.json()["errors"][0]["loc"][-1] == "n"


async def test_unhandled_exception_hides_details(app: FastAPI):
    @app.get("/_crash")
    async def crash() -> None:
        raise RuntimeError("secret internal detail")

    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
    ) as c:
        r = await c.get("/_crash")
    assert r.status_code == 500
    assert "secret" not in r.text
    assert r.json()["code"] == "internal_error"
