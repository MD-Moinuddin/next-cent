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
  const parts = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).formatToParts(0);
  return parts.find((p) => p.type === "currency")?.value ?? currency;
}

export function useMoney() {
  const locale = deviceLocale();
  return {
    format: (minor: number, currency: string) =>
      formatMoney(minor, currency, locale),
    symbol: (currency: string) => currencySymbol(currency, locale),
  };
}
