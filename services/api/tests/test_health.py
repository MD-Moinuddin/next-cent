async def test_liveness(anon_client):
    r = await anon_client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


async def test_readiness_checks_database(anon_client):
    r = await anon_client.get("/health/ready")
    assert r.status_code == 200
    assert r.json() == {"status": "ready"}
