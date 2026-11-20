import { CURRENCY_EXPONENTS } from "@nextcent/shared";

export interface CurrencyOption {
  code: string;
  name: string;
}

/** Localised currency name, falling back to the code on engines without Intl.DisplayNames. */
export function currencyName(code: string, locale: string): string {
  try {
    if (typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function")
      return code;
    return (
      new Intl.DisplayNames([locale], { type: "currency" }).of(code) ?? code
    );
  } catch {
    return code;
  }
}

export function currencyOptions(locale: string, query = ""): CurrencyOption[] {
  const q = query.trim().toLowerCase();
  return Object.keys(CURRENCY_EXPONENTS)
    .sort()
    .map((code) => ({ code, name: currencyName(code, locale) }))
    .filter(
      (o) =>
        !q ||
        o.code.toLowerCase().includes(q) ||
        o.name.toLowerCase().includes(q),
    );
}
