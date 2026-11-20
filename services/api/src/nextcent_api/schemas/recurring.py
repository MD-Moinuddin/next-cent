import uuid
from datetime import date
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from nextcent_api.schemas.common import Currency, PositiveAmount


class RecurringIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["expense", "income"]
    amount_minor: PositiveAmount
    currency: Currency
    category_id: uuid.UUID | None = None
    merchant: str | None = Field(default=None, max_length=120)
    cadence: Literal["weekly", "monthly", "yearly"]
    anchor_on: date

    @field_validator("merchant")
    @classmethod
    def _blank_to_none(cls, value: str | None) -> str | None:
        return (value.strip() or None) if value else None

    @model_validator(mode="after")
    def _expense_needs_category(self) -> Self:
        if self.kind == "expense" and self.category_id is None:
            raise ValueError("category_id is required for expenses")
        return self


class RecurringPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount_minor: PositiveAmount | None = None
    category_id: uuid.UUID | None = None
    merchant: str | None = Field(default=None, max_length=120)
    active: bool | None = None


class RecurringOut(BaseModel):
    id: uuid.UUID
    kind: str
    amount_minor: int
    currency: str
    category_id: uuid.UUID | None
    merchant: str | None
    cadence: str
    anchor_on: date
    next_due_on: date
    active: bool
    is_primary_income: bool
