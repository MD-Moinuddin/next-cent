import { toIsoDate } from "@nextcent/shared";
import { t } from "@/i18n/strings";

/** Percentage (0-100, integer) of income spent, or null when there is no income to compare to. */
export function spentPercent(
  incomeMinor: number,
  expenseMinor: number,
): number | null {
  if (incomeMinor <= 0) return null;
  return Math.min(
    100,
    Math.max(0, Math.round((expenseMinor / incomeMinor) * 100)),
  );
}

/** "Today", "Yesterday" or a short localised date for a calendar date string. */
export function dayLabel(
  iso: string,
  now: Date = new Date(),
  locale = "en-US",
): string {
  if (iso === toIsoDate(now)) return t.common.today;
  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  );
  if (iso === toIsoDate(yesterday)) return t.common.yesterday;
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
  }).format(new Date(y!, m! - 1, d));
}
