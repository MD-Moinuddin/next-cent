import re

CURRENCY_EXPONENTS: dict[str, int] = {
    "AED": 2, "AUD": 2, "BDT": 2, "BGN": 2, "BHD": 3, "BRL": 2, "CAD": 2, "CHF": 2,
    "CNY": 2, "CZK": 2, "DKK": 2, "EGP": 2, "EUR": 2, "GBP": 2, "HKD": 2, "HUF": 2,
    "IDR": 2, "INR": 2, "JOD": 3, "JPY": 0, "KRW": 0, "KWD": 3, "MXN": 2, "MYR": 2,
    "NGN": 2, "NOK": 2, "NZD": 2, "OMR": 3, "PHP": 2, "PKR": 2, "PLN": 2, "RON": 2,
    "SAR": 2, "SEK": 2, "SGD": 2, "THB": 2, "TND": 3, "TRY": 2, "USD": 2, "VND": 0,
    "ZAR": 2,
}  # fmt: skip

MAX_AMOUNT_MINOR = 1_000_000_000_000

# ASCII digits only (not \d, which matches Unicode digits)
_AMOUNT_RE = re.compile(r"([0-9]+)(?:\.([0-9]+))?")


class MoneyError(ValueError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def get_exponent(currency: str) -> int:
    try:
        return CURRENCY_EXPONENTS[currency]
    except KeyError:
        raise MoneyError("unsupported_currency") from None


def parse_amount(text: str, currency: str) -> int:
    exponent = get_exponent(currency)
    match = _AMOUNT_RE.fullmatch(text.strip())
    if match is None:
        raise MoneyError("invalid_amount")
    whole, fraction = match.group(1), match.group(2) or ""
    if len(fraction) > exponent:
        raise MoneyError("too_many_decimals")
    minor = int(whole + fraction.ljust(exponent, "0"))
    if minor > MAX_AMOUNT_MINOR:
        raise MoneyError("amount_too_large")
    return minor


def minor_to_decimal_string(minor: int, currency: str) -> str:
    exponent = get_exponent(currency)
    sign = "-" if minor < 0 else ""
    digits = str(abs(minor)).rjust(exponent + 1, "0")
    if exponent == 0:
        return sign + digits
    return f"{sign}{digits[:-exponent]}.{digits[-exponent:]}"
