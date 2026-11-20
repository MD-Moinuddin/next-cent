import uuid
from datetime import date, datetime
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from nextcent_api.models import Transaction
from nextcent_api.schemas.common import Currency, PositiveAmount


class TransactionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["expense", "income"]
    amount_minor: PositiveAmount
    currency: Currency
    occurred_on: date
    category_id: uuid.UUID | None = None
    merchant: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=500)
    tags: list[str] = Field(default_factory=list, max_length=20)
    base_version: int | None = Field(default=None, ge=1)

    @field_validator("occurred_on")
    @classmethod
    def _date_in_range(cls, value: date) -> date:
        if not date(2000, 1, 1) <= value <= date(2100, 12, 31):
            raise ValueError("date out of range")
        return value

    @field_validator("merchant", "note")
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        return (value.strip() or None) if value else None

    @field_validator("tags")
    @classmethod
    def _normalise_tags(cls, value: list[str]) -> list[str]:
        seen: dict[str, str] = {}
        for raw in value:
            name = raw.strip()
            if not 1 <= len(name) <= 30:
                raise ValueError("tags must be 1-30 characters")
            seen.setdefault(name.lower(), name)
        return list(seen.values())

    @model_validator(mode="after")
    def _expense_needs_category(self) -> Self:
        if self.kind == "expense" and self.category_id is None:
            raise ValueError("category_id is required for expenses")
        return self


class TransactionOut(BaseModel):
    id: uuid.UUID
    kind: str
    amount_minor: int
    currency: str
    occurred_on: date
    category_id: uuid.UUID | None
    merchant: str | None
    note: str | None
    recurring_id: uuid.UUID | None
    tags: list[str]
    version: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None

    @classmethod
    def from_model(cls, tx: Transaction) -> "TransactionOut":
        return cls(
            id=tx.id, kind=tx.kind, amount_minor=tx.amount_minor, currency=tx.currency,
            occurred_on=tx.occurred_on, category_id=tx.category_id, merchant=tx.merchant,
            note=tx.note, recurring_id=tx.recurring_id, tags=sorted(t.name for t in tx.tags),
            version=tx.version, created_at=tx.created_at, updated_at=tx.updated_at,
            deleted_at=tx.deleted_at,
        )  # fmt: skip
