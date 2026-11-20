import { t } from "@/i18n/strings";
import { ApiError, NetworkError } from "@/lib/query/errors";

type ErrorKey = keyof typeof t.errors;
const isKey = (k: string): k is ErrorKey => k in t.errors;

/** Maps a validation message (money error code) to a localised string. */
export function fieldError(
  code: string | undefined,
  raw?: string,
): string | undefined {
  if (!code) return undefined;
  if (code === "invalid_amount" && raw && /^[0-9]+,[0-9]+$/.test(raw.trim()))
    return t.errors.use_dot_decimal;
  return isKey(code) ? t.errors[code] : t.errors.generic;
}

/** Maps a failed save to a localised string. */
export function saveError(e: unknown): string {
  if (e instanceof NetworkError) return t.common.offlineOnly;
  if (e instanceof ApiError && e.code && isKey(e.code)) return t.errors[e.code];
  return t.errors.generic;
}
