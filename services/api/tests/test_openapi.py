import re

HTTP_METHODS = {"get", "put", "post", "patch", "delete"}


async def test_openapi_contract_rules(anon_client):
    spec = (await anon_client.get("/openapi.json")).json()
    ids = []
    for path, item in spec["paths"].items():
        assert not path.startswith("/internal")
        for method, op in item.items():
            if method not in HTTP_METHODS:
                continue
            op_id = op["operationId"]
            ids.append(op_id)
            assert re.fullmatch(r"[a-z][a-z0-9_]*", op_id), op_id
            assert "_v1_" not in op_id, f"auto-generated operation id: {op_id}"
            if path.startswith("/v1"):
                assert op.get("security"), f"{method.upper()} {path} must require auth"
    assert len(ids) == len(set(ids))
