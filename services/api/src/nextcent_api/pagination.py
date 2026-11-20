import base64
import json

from nextcent_api.errors import ProblemError


def encode_cursor(data: dict[str, str]) -> str:
    raw = json.dumps(data, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(token: str) -> dict[str, str]:
    try:
        padded = token + "=" * (-len(token) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded.encode()))
        if not isinstance(data, dict):
            raise ValueError
        return {str(k): str(v) for k, v in data.items()}
    except (ValueError, UnicodeDecodeError) as exc:
        raise ProblemError(400, "invalid_cursor", "Invalid pagination cursor") from exc
