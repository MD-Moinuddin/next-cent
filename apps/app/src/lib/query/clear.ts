import type { QueryClient } from "@tanstack/react-query";
import {
  abandonStartedWrites,
  clearRemovedCache,
  settleTransactionWrites,
} from "@/features/transactions/mutations";
import { deleteExportCache } from "@/features/settings/exportCache";
import { removeOwner, resetIdentity } from "@/lib/auth/identity";
import { discardPendingPersistence, persister } from "./persist";
import { queryClient } from "./queryClient";

/** Reason a discarded mutation gives if its retry timer still fires. Not retryable. */
export class MutationDiscardedError extends Error {
  constructor() {
    super("The queued change was discarded");
    this.name = "MutationDiscardedError";
  }
}

/**
 * Drops every queued, paused, backing-off or in-flight mutation so none of them can reach the API
 * again, then waits (bounded) for a request already on the wire. Leaves the auth session alone.
 *
 * Removing a mutation from the cache does not stop its retry timer, so each one is first neutered:
 * its next attempt rejects without calling the API (the retry policy treats that as permanent).
 */
export async function discardQueuedMutations(
  client: QueryClient = queryClient,
): Promise<void> {
  abandonStartedWrites(); // attempts already running (e.g. waiting at the identity gate) never send
  await client.cancelQueries();
  const cache = client.getMutationCache();
  cache.getAll().forEach((m) => {
    m.setOptions({
      ...m.options,
      mutationFn: () => Promise.reject(new MutationDiscardedError()),
      retry: false,
    });
    m.destroy(); // clear() alone leaves each mutation's gc timer running
  });
  cache.clear();
  await settleTransactionWrites();
}

/** Privacy: call on sign-out, account deletion and identity change so no financial data stays on the device. */
export async function clearLocalData(): Promise<void> {
  resetIdentity(); // writes still waiting for an identity are abandoned
  await discardQueuedMutations(queryClient);
  queryClient.clear();
  await discardPendingPersistence();
  clearRemovedCache();
  try {
    deleteExportCache();
  } catch {
    // best effort: a missing native module or file must not block sign-out
  }
  await persister.removeClient();
  await removeOwner();
}
