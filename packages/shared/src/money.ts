export const CURRENCY_EXPONENTS: Record<string, number> = {
  AED: 2,
  AUD: 2,
  BDT: 2,
  BGN: 2,
  BHD: 3,
  BRL: 2,
  CAD: 2,
  CHF: 2,
  CNY: 2,
  CZK: 2,
  DKK: 2,
  EGP: 2,
  EUR: 2,
  GBP: 2,
  HKD: 2,
  HUF: 2,
  IDR: 2,
  INR: 2,
  JOD: 3,
  JPY: 0,
  KRW: 0,
  KWD: 3,
  MXN: 2,
  MYR: 2,
  NGN: 2,
  NOK: 2,
  NZD: 2,
  OMR: 3,
  PHP: 2,
  PKR: 2,
  PLN: 2,
  RON: 2,
  SAR: 2,
  SEK: 2,
  SGD: 2,
  THB: 2,
  TND: 3,
  TRY: 2,
  USD: 2,
  VND: 0,
  ZAR: 2,
};

export const MAX_AMOUNT_MINOR = 1_000_000_000_000;

export type MoneyErrorCode =
  | "invalid_amount"
  | "too_many_decimals"
  | "amount_too_large"
  | "unsupported_currency";

export class MoneyError extends Error {
  constructor(public readonly code: MoneyErrorCode) {
    super(code);
    this.name = "MoneyError";
  }
}

/** Own-property check, so "constructor", "toString" and "__proto__" are not currencies. */
export function isSupportedCurrency(currency: string): boolean {
  return Object.hasOwn(CURRENCY_EXPONENTS, currency);
}

export function getExponent(currency: string): number {
  if (!isSupportedCurrency(currency))
    throw new MoneyError("unsupported_currency");
  return CURRENCY_EXPONENTS[currency] as number;
}

const AMOUNT_RE = /^([0-9]+)(?:\.([0-9]+))?$/;

/** Parses a plain decimal string ("14.50") into integer minor units. Never uses floats. */
export function parseAmount(input: string, currency: string): number {
  const exponent = getExponent(currency);
  const match = AMOUNT_RE.exec(input.trim());
  if (!match) throw new MoneyError("invalid_amount");
  const whole = match[1] ?? "0";
  const fraction = match[2] ?? "";
  if (fraction.length > exponent) throw new MoneyError("too_many_decimals");
  const minor = Number(whole + fraction.padEnd(exponent, "0"));
  if (!Number.isSafeInteger(minor) || minor > MAX_AMOUNT_MINOR) {
    throw new MoneyError("amount_too_large");
  }
  return minor;
}

/** Exact conversion to a decimal string, used for display input and CSV export. */
export function minorToDecimalString(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor)) throw new MoneyError("invalid_amount");
  const exponent = getExponent(currency);
  const sign = minor < 0 ? "-" : "";
  const digits = Math.abs(minor)
    .toString()
    .padStart(exponent + 1, "0");
  if (exponent === 0) return sign + digits;
  return `${sign}${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

/** Display only. Values are bounded by MAX_AMOUNT_MINOR so the division is exact enough for display. */
export function formatAmount(
  minor: number,
  currency: string,
  locale?: string,
): string {
  const exponent = getExponent(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    minor / 10 ** exponent,
  );
}
