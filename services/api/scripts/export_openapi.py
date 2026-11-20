"""Writes the OpenAPI spec to contracts/openapi.json deterministically."""

import json
import os
from pathlib import Path

for key, value in {
    "NEXTCENT_AUTH_ISSUER": "https://auth.example",
    "NEXTCENT_AUTH_JWKS_URL": "https://auth.example/jwks.json",
    "NEXTCENT_INTERNAL_TASK_SECRET": "export-only",
}.items():
    os.environ.setdefault(key, value)

from nextcent_api.main import create_app  # noqa: E402

OUT = Path(__file__).resolve().parents[3] / "contracts" / "openapi.json"
spec = create_app().openapi()
OUT.write_text(json.dumps(spec, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(f"wrote {OUT}")
