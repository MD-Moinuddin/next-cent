import json
from pathlib import Path

import pytest

from nextcent_api.money import (
    CURRENCY_EXPONENTS,
    MAX_AMOUNT_MINOR,
    MoneyError,
    get_exponent,
    minor_to_decimal_string,
    parse_amount,
)

CONTRACTS = Path(__file__).resolve().parents[3] / "contracts"


def load(name: str) -> dict:
    return json.loads((CONTRACTS / name).read_text(encoding="utf-8"))


def test_currency_table_matches_contract():
    assert load("currencies.json") == CURRENCY_EXPONENTS


def test_unknown_currency_rejected():
    with pytest.raises(MoneyError) as e:
        get_exponent("XXX")
    assert e.value.code == "unsupported_currency"


@pytest.mark.parametrize("v", load("money-vectors.json")["valid"])
def test_valid_vectors(v):
    assert parse_amount(v["input"], v["currency"]) == v["minor"]
    assert minor_to_decimal_string(v["minor"], v["currency"]) == v["decimal"]


@pytest.mark.parametrize("v", load("money-vectors.json")["invalid"])
def test_invalid_vectors(v):
    with pytest.raises(MoneyError) as e:
        parse_amount(v["input"], v["currency"])
    assert e.value.code == v["code"]


def test_max_is_js_safe():
    assert MAX_AMOUNT_MINOR < 2**53
