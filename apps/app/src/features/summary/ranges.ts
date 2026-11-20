import { MAX_DATE, MIN_DATE, monthRange, weekRange } from "@nextcent/shared";
import type { t } from "@/i18n/strings";

export type SummaryMode = "week" | "month" | "custom";
export const MAX_SPAN_DAYS = 3660; // same limit as the API

export const currentMonth = (ref: Date = new Date()) => monthRange(ref);
export const shiftMonth = (ref: Date, delta: number) =>
  new Date(ref.getFullYear(), ref.getMonth() + delta, 1);
export const shiftWeek = (ref: Date, delta: number) =>
  new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 7 * delta);

export function shiftReference(
  mode: "week" | "month",
  ref: Date,
  delta: number,
): Date {
  return mode === "week" ? shiftWeek(ref, delta) : shiftMonth(ref, delta);
}

export const rangeFor = (mode: "week" | "month", ref: Date) =>
  mode === "week" ? weekRange(ref) : monthRange(ref);

export type RangeError = Extract<
  keyof typeof t.errors,
  "invalid_date" | "date_out_of_range" | "invalid_range" | "range_too_long"
>;
export type CustomRange =
  { ok: true; from: string; to: string } | { ok: false; error: RangeError };

export const isRealIsoDate = (s: string): boolean => parseIso(s) !== null;

function parseIso(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  return back.getUTCFullYear() === y &&
    back.getUTCMonth() === mo - 1 &&
    back.getUTCDate() === d
    ? ms
    : null;
}

/** Validates the custom range before any query: real YYYY-MM-DD dates, from <= to, span <= 3660 days. */
export function validateCustomRange(from: string, to: string): CustomRange {
  const a = parseIso(from.trim());
  const b = parseIso(to.trim());
  if (a === null || b === null) return { ok: false, error: "invalid_date" };
  const f = from.trim();
  const e = to.trim();
  if (f < MIN_DATE || e > MAX_DATE || e < MIN_DATE || f > MAX_DATE)
    return { ok: false, error: "date_out_of_range" };
  if (a > b) return { ok: false, error: "invalid_range" };
  if ((b - a) / 86_400_000 > MAX_SPAN_DAYS)
    return { ok: false, error: "range_too_long" };
  return { ok: true, from: f, to: e };
}
