import { useMutationState } from "@tanstack/react-query";
import type { PutVars } from "./optimistic";

export const TX_PUT_KEY = ["transactions", "put"] as const;
export const TX_DELETE_KEY = ["transactions", "delete"] as const;
export const TX_RESTORE_KEY = ["transactions", "restore"] as const;

/**
 * Balance change from queued creates (home currency only). Puts are de-duplicated by id (the last
 * submitted wins), queued deletes cancel their put, edits (a version or a rebase) are ignored because
 * their previous value is unknown.
 */
export function pendingBalanceDelta(
  puts: PutVars[],
  deletedIds: Set<string>,
  homeCurrency: string,
): number {
  const latest = new Map<string, PutVars>();
  const created = new Set<string>();
  for (const v of puts) {
    // The first queued write decides whether the row is a create: no version and not a rebased edit.
    if (!latest.has(v.id) && v.body.base_version == null && !v.rebase)
      created.add(v.id);
    latest.set(v.id, v);
  }
  let sum = 0;
  for (const v of latest.values()) {
    if (
      deletedIds.has(v.id) ||
      !created.has(v.id) ||
      v.body.currency !== homeCurrency
    )
      continue;
    sum +=
      v.body.kind === "income" ? v.body.amount_minor : -v.body.amount_minor;
  }
  return sum;
}

export function pendingIds(vars: PutVars[]): Set<string> {
  return new Set(vars.map((v) => v.id));
}

export function usePendingPuts(): PutVars[] {
  return useMutationState({
    filters: { mutationKey: TX_PUT_KEY, status: "pending" },
    select: (m) => m.state.variables as PutVars,
  });
}

export function usePendingDeletes(): Set<string> {
  const ids = useMutationState({
    filters: { mutationKey: TX_DELETE_KEY, status: "pending" },
    select: (m) => m.state.variables as string,
  });
  return new Set(ids);
}

/** Ids with a queued restore (undo of a delete). */
export function usePendingRestores(): Set<string> {
  const ids = useMutationState({
    filters: { mutationKey: TX_RESTORE_KEY, status: "pending" },
    select: (m) => m.state.variables as string,
  });
  return new Set(ids);
}
