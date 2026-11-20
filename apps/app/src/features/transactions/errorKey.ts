import { t } from "@/i18n/strings";
import { ApiError } from "@/lib/query/errors";

export type ErrorKey = keyof typeof t.errors;

const isKey = (k: string): k is ErrorKey =>
  Object.hasOwn(t.errors, k) && typeof t.errors[k as ErrorKey] === "string";

/** Maps an API error to the key of its localized message in `t.errors` (server codes share the key). */
export function apiErrorKey(error: unknown): ErrorKey {
  if (error instanceof ApiError && error.code && isKey(error.code))
    return error.code;
  return "generic";
}
