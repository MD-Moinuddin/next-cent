import { getExponent } from "@nextcent/shared";
import { t } from "@/i18n/strings";

/**
 * Accessible name for a pressable whose visible text is `visible` (one entry per visible text node).
 * It BEGINS with the visible text joined by single spaces (WCAG 2.5.3 Label in Name), followed by extra words.
 * The components render a trailing space after every text node but the last, so the DOM text content equals
 * `visible.join(" ")` exactly (axe's label-content-name-mismatch concatenates text nodes without separators).
 */
export function labelInName(
  visible: readonly string[],
  ...extras: (string | false | null | undefined)[]
): string {
  return [visible.join(" "), ...extras.filter((e): e is string => !!e)].join(
    ", ",
  );
}

/** Amount spelled for screen readers without a sign, e.g. "14.50 euros". */
export function spokenAmount(
  minor: number,
  currency: string,
  locale: string,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "name",
  }).format(minor / 10 ** getExponent(currency));
}

/** Label for a transaction row: visible text, then direction word, amount in words and the pending marker. */
export function transactionLabel({
  visible,
  kind,
  minor,
  currency,
  locale,
  pending,
}: {
  visible: readonly string[];
  kind: string;
  minor: number;
  currency: string;
  locale: string;
  pending: boolean;
}): string {
  return labelInName(
    visible,
    kind === "income" ? t.common.income : t.common.expense,
    spokenAmount(minor, currency, locale),
    pending && t.transactions.pendingSync,
  );
}
