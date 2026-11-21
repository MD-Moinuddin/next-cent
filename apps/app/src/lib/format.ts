import { getLocales } from "expo-localization";
import { formatAmount } from "@nextcent/shared";

export function deviceLocale(): string {
  return getLocales()[0]?.languageTag ?? "en-US";
}

export function formatMoney(
  minor: number,
  currency: string,
  locale: string = deviceLocale(),
): string {
  return formatAmount(minor, currency, locale);
}

export function currencySymbol(
  currency: string,
  locale: string = deviceLocale(),
): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  });
  if (typeof formatter.formatToParts === "function") {
    return (
      formatter.formatToParts(0).find((p) => p.type === "currency")?.value ??
      currency
    );
  }
  // Some engines (Hermes on mobile) have no formatToParts. Format zero and strip the digits,
  // separators, spaces and direction marks, which leaves the symbol.
  const symbol = formatter.format(0).replace(/[0-9.,\s  ‎‏-]/g, "");
  return symbol.length > 0 && symbol.length <= 4 ? symbol : currency;
}

export function useMoney() {
  const locale = deviceLocale();
  return {
    format: (minor: number, currency: string) =>
      formatMoney(minor, currency, locale),
    symbol: (currency: string) => currencySymbol(currency, locale),
  };
}
