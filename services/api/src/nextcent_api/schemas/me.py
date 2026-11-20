import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from nextcent_api.schemas.common import Currency, NonNegativeAmount, PositiveAmount


class MeOut(BaseModel):
    id: uuid.UUID
    home_currency: str
    opening_balance_minor: int | None
    monthly_income_minor: int | None
    onboarding_completed: bool
    created_at: datetime


class MePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    home_currency: Currency | None = None
    opening_balance_minor: NonNegativeAmount | None = None
    monthly_income_minor: PositiveAmount | None = None  # explicit null clears the income rule
    onboarding_completed: bool | None = None
