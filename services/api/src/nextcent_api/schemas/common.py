from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field

from nextcent_api.money import CURRENCY_EXPONENTS, MAX_AMOUNT_MINOR


def _validate_currency(value: str) -> str:
    value = value.upper()
    if value not in CURRENCY_EXPONENTS:
        raise ValueError("unsupported currency")
    return value


Currency = Annotated[str, AfterValidator(_validate_currency)]
PositiveAmount = Annotated[int, Field(strict=True, gt=0, le=MAX_AMOUNT_MINOR)]
NonNegativeAmount = Annotated[int, Field(strict=True, ge=0, le=MAX_AMOUNT_MINOR)]


class Page[T](BaseModel):
    items: list[T]
    next_cursor: str | None = None
