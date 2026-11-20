import json
import logging
import traceback
from contextvars import ContextVar
from typing import Any

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

# Database driver errors can quote the failing row (PostgreSQL's "DETAIL: Failing row contains
# (...)"), which holds amounts, merchants and notes. Their messages never reach logs or Sentry.
_DB_ERROR_MODULES = ("sqlalchemy", "asyncpg")
WITHHELD = "<details withheld: database error messages can contain row data>"


def is_database_error(exc: BaseException) -> bool:
    return type(exc).__module__.startswith(_DB_ERROR_MODULES)


def _safe_message(exc: BaseException) -> str:
    if not is_database_error(exc):
        return str(exc)
    constraint = getattr(exc, "constraint_name", None)
    return f"{WITHHELD} (constraint: {constraint})" if constraint else WITHHELD


def redacted_traceback(exc: BaseException) -> str:
    """Like traceback.format_exception, but database error messages are withheld."""
    chain: list[BaseException] = []
    current: BaseException | None = exc
    while current is not None and all(current is not seen for seen in chain):
        chain.append(current)
        current = current.__cause__ or (
            None if current.__suppress_context__ else current.__context__
        )
    blocks = []
    for item in reversed(chain):
        frames = "".join(traceback.format_tb(item.__traceback__))
        name = f"{type(item).__module__}.{type(item).__qualname__}"
        blocks.append(f"Traceback (most recent call last):\n{frames}{name}: {_safe_message(item)}")
    return "\n\nThe above exception led to the following exception:\n\n".join(blocks)


def scrub_sentry_event(event: Any, _hint: Any) -> Any:
    """Sentry `before_send`: withhold database error messages (see `is_database_error`)."""
    for value in (event.get("exception") or {}).get("values") or []:
        module = str(value.get("module") or "")
        if module.startswith(_DB_ERROR_MODULES):
            value["value"] = WITHHELD
    return event


class JsonFormatter(logging.Formatter):
    """One JSON object per line. Never add request bodies, tokens or amounts here."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_var.get(),
        }
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):  # structured extras, e.g. the access log line
            payload.update({k: v for k, v in fields.items() if k not in payload})
        if record.exc_info and record.exc_info[1] is not None:
            payload["exc"] = redacted_traceback(record.exc_info[1])
        return json.dumps(payload)


def configure_logging(level: int = logging.INFO) -> None:
    """Idempotent: replaces the root handlers, so repeated calls never duplicate them.

    uvicorn's own error logger is routed through the same JSON handler, so the traceback it prints
    for an unhandled exception is redacted too (its plain-text handler would print it verbatim).
    """
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    for name in ("uvicorn", "uvicorn.error"):
        server_logger = logging.getLogger(name)
        server_logger.handlers = []
        server_logger.propagate = True
