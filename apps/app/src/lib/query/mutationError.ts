import { apiErrorKey } from "@/features/transactions/errorKey";
import { t } from "@/i18n/strings";
import { NetworkError } from "./errors";

/** Message for a failed online-only mutation: offline notice, a mapped API code, or the generic text. */
export function mutationMessage(e: unknown): string {
  if (e instanceof NetworkError) return t.common.offlineOnly;
  return t.errors[apiErrorKey(e)];
}
