import uuid
from datetime import date

from pydantic import BaseModel


class CategoryTotal(BaseModel):
    category_id: uuid.UUID
    name: str
    icon: str
    total_minor: int


class SummaryOut(BaseModel):
    range_start: date
    range_end: date
    currency: str
    income_minor: int
    expense_minor: int
    net_minor: int
    balance_minor: int
    by_category: list[CategoryTotal]
    excluded_other_currency_count: int
