import {
  useMutation,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import { api } from "@/lib/api";
import { assertIdentity, authReady } from "@/lib/auth/identity";
import { ApiError, isRetryable, isUnauthorized } from "@/lib/query/errors";
import { queryClient, queryKeys } from "@/lib/query/queryClient";
import type { TransactionOut, TransactionPage } from "@/lib/types";
import {
  applyUpsertToList,
  buildOptimistic,
  findInPages,
  removeFromPages,
  type ListFilters,
  type PutVars,
} from "./optimistic";
import { TX_DELETE_KEY, TX_PUT_KEY, TX_RESTORE_KEY } from "./pending";

export { TX_DELETE_KEY, TX_PUT_KEY };
export { TX_RESTORE_KEY };
const REBASE_ATTEMPTS = 3;
// Rows removed by a queued delete, one map per registered client, so a queued undo can put them back.
const removedCaches = new Set<Map<string, TransactionOut>>();
/** Privacy: forgets every cached row (called from clearLocalData on sign-out and account deletion). */
export function clearRemovedCache(): void {
  removedCaches.forEach((m) => m.clear());
}
export const TX_SCOPE = { id: "transactions" }; // same scope id => mutations run one at a time, in order
// A 401 usually means the token lapsed; each attempt asks the session for a token again, so retry a
// couple of times. If it persists, the write stays as a failed mutation the banner offers to retry.
const AUTH_RETRIES = 2; // 3 attempts in all
const retry = (count: number, error: unknown) =>
  (isRetryable(error) && count < 6) ||
  (isUnauthorized(error) && count < AUTH_RETRIES);
const retryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000);

// Requests on the wire, so account deletion can wait for them before deleting the account.
const inFlight = new Set<Promise<unknown>>();
const SETTLE_TIMEOUT_MS = 10_000;
/** Waits (bounded) until no transaction write is on the wire. */
export async function settleTransactionWrites(
  timeoutMs = SETTLE_TIMEOUT_MS,
): Promise<void> {
  if (!inFlight.size) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled([...inFlight]),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  clearTimeout(timer);
}

/**
 * Every queued write waits for a confirmed signed-in identity before it calls the API: restored or
 * reconnected writes never run while signed out. `send` re-checks, right before EACH request (a
 * rebase makes two), that the identity the attempt started under is still the confirmed one; after a
 * sign-out or user change the attempt aborts without sending (identity.ts), and every retry passes
 * through the gate again.
 */
type Send = <R>(request: () => Promise<R>) => Promise<R>;

/** An attempt that started before its mutation was discarded (account deletion, clearLocalData). */
export class WriteAbandonedError extends Error {
  constructor() {
    super("The queued change was discarded");
    this.name = "WriteAbandonedError";
  }
}
let writeEpoch = 0;
/**
 * Makes every attempt already started (for example one waiting at the identity gate) abort before
 * its next request. Called when the queue is discarded; later retries are neutered separately.
 */
export function abandonStartedWrites(): void {
  writeEpoch += 1;
}
const gated =
  <V, R>(fn: (vars: V, send: Send) => Promise<R>) =>
  async (vars: V): Promise<R> => {
    const epoch = writeEpoch;
    const owner = await authReady();
    const send: Send = (request) => {
      if (epoch !== writeEpoch) throw new WriteAbandonedError();
      assertIdentity(owner);
      return request();
    };
    const attempt = fn(vars, send);
    inFlight.add(attempt);
    const done = () => inFlight.delete(attempt);
    attempt.then(done, done);
    return attempt;
  };

export const newTransactionId = (): string => Crypto.randomUUID();

type ListData = InfiniteData<TransactionPage> | undefined;

/**
 * Registers the offline-capable defaults on a client. Called at module load for the app client so
 * paused mutations restored from storage can resume after hydration (a restored mutation only has
 * its key and variables, the functions come from these defaults).
 */
export function registerTransactionMutations(client: QueryClient): void {
  const LIST_KEY = ["transactions", "list"] as const;
  const lists = () => client.getQueriesData<ListData>({ queryKey: LIST_KEY });
  const filtersOf = (key: readonly unknown[]): ListFilters | undefined => {
    const f = key[2];
    return typeof f === "object" && f !== null ? (f as ListFilters) : undefined;
  };
  const upsertEverywhere = (tx: TransactionOut) => {
    for (const [key, data] of lists())
      client.setQueryData(key, applyUpsertToList(data, tx, filtersOf(key)));
  };
  const removeEverywhere = (id: string) => {
    for (const [key, data] of lists())
      client.setQueryData(key, removeFromPages(data, id));
  };
  const findCached = (id: string): TransactionOut | undefined => {
    const detail = client.getQueryData<TransactionOut>(
      queryKeys.transaction(id),
    );
    if (detail) return detail;
    for (const [, data] of lists()) {
      const hit = findInPages(data, id);
      if (hit) return hit;
    }
    return undefined;
  };
  // Keeps the detail cache (the edit screen) in step with a queued delete or restore.
  const setDeletedOnDetail = (id: string, deleted: boolean) =>
    client.setQueryData<TransactionOut>(queryKeys.transaction(id), (old) =>
      old
        ? {
            ...old,
            deleted_at: deleted
              ? (old.deleted_at ?? new Date().toISOString())
              : null,
          }
        : old,
    );
  const removed = new Map<string, TransactionOut>();
  removedCaches.add(removed);

  // Reconcile with the server once the queue is idle. Runs on success and on (permanent) failure, so a
  // rejected change reverts through the refetch instead of leaving its optimistic row behind.
  const reconcileWhenIdle = () => {
    if (client.isMutating({ mutationKey: ["transactions"] }) <= 1) {
      void client.invalidateQueries({ queryKey: queryKeys.transactions });
      void client.invalidateQueries({ queryKey: ["summary"] });
    }
  };

  client.setMutationDefaults(TX_PUT_KEY, {
    mutationFn: gated(async ({ id, body, rebase }: PutVars, send) => {
      if (!rebase) return send(() => api.putTransaction(id, body));
      // This device has earlier queued writes for the row (same scope, so they already ran): use the
      // latest server version (last write wins over our own earlier change), or create it when the
      // server does not have it. Errors other than 404 (network, 5xx) propagate and are retried.
      // Another device may edit between the GET and the PUT: on a version_conflict re-read and retry,
      // at most 3 attempts in all; the last error then takes the normal failure path.
      for (let attempt = 1; ; attempt++) {
        let version: number | undefined;
        try {
          version = (await send(() => api.getTransaction(id))).version;
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 404)) throw e;
        }
        try {
          return await send(() =>
            api.putTransaction(id, { ...body, base_version: version }),
          );
        } catch (e) {
          const conflict =
            e instanceof ApiError &&
            e.status === 409 &&
            e.code === "version_conflict";
          if (!conflict || attempt >= REBASE_ATTEMPTS) throw e;
        }
      }
    }),
    scope: TX_SCOPE,
    retry,
    retryDelay,
    onMutate: async (vars: PutVars) => {
      await client.cancelQueries({ queryKey: LIST_KEY });
      const optimistic = buildOptimistic(vars, findCached(vars.id));
      upsertEverywhere(optimistic);
      client.setQueryData(queryKeys.transaction(vars.id), optimistic);
    },
    onError: reconcileWhenIdle,
    onSettled: reconcileWhenIdle,
  });

  client.setMutationDefaults(TX_DELETE_KEY, {
    mutationFn: gated((id: string, send) =>
      send(() => api.deleteTransaction(id)),
    ),
    scope: TX_SCOPE,
    retry,
    retryDelay,
    onMutate: async (id: string) => {
      await client.cancelQueries({ queryKey: LIST_KEY });
      const row = findCached(id);
      if (row) removed.set(id, row);
      removeEverywhere(id);
      setDeletedOnDetail(id, true);
    },
    onError: reconcileWhenIdle,
    onSettled: reconcileWhenIdle,
  });

  client.setMutationDefaults(TX_RESTORE_KEY, {
    mutationFn: gated((id: string, send) =>
      send(() => api.restoreTransaction(id)),
    ),
    scope: TX_SCOPE,
    retry,
    retryDelay,
    onMutate: async (id: string) => {
      setDeletedOnDetail(id, false);
      const row = removed.get(id);
      if (!row) return;
      await client.cancelQueries({ queryKey: LIST_KEY });
      removed.delete(id);
      upsertEverywhere({ ...row, deleted_at: null });
    },
    onError: reconcileWhenIdle,
    onSettled: reconcileWhenIdle,
  });
}

registerTransactionMutations(queryClient);

export const usePutTransaction = () =>
  useMutation<unknown, Error, PutVars>({ mutationKey: TX_PUT_KEY });
export const useDeleteTransaction = () =>
  useMutation<unknown, Error, string>({ mutationKey: TX_DELETE_KEY });
export const useRestoreTransaction = () =>
  useMutation<unknown, Error, string>({ mutationKey: TX_RESTORE_KEY });
