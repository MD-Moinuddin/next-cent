import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { DehydrateOptions, Mutation } from "@tanstack/react-query";
import {
  PersistQueryClientProvider,
  type PersistedClient,
  type Persister,
} from "@tanstack/react-query-persist-client";
import type { ReactNode } from "react";
import { getConfirmedUserId, writeOwner } from "@/lib/auth/identity";
import "./online";
import { CACHE_MAX_AGE_MS, queryClient } from "./queryClient";

export const CACHE_VERSION = "1"; // bump when cached shapes change; old caches are discarded
export const PERSIST_KEY = "nextcent-cache";
const base = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: PERSIST_KEY,
  throttleTime: 1000,
  // Writes are throttled and may run up to a second after they were requested. Refuse any snapshot taken
  // before the last clearLocalData(), so sign-out can never be undone by a late trailing write.
  serialize: (client) => {
    if (snapshotEpoch.get(client) !== epoch)
      throw new Error("stale snapshot dropped");
    return JSON.stringify(client);
  },
});

let epoch = 0;
const snapshotEpoch = new WeakMap<PersistedClient, number>();
const inFlight = new Set<Promise<void>>();

// Restoring is async; identity checks wait for it so a clear can never be undone by a late hydrate.
let restoring: Promise<void> | null = null;
let endRestore: () => void = () => {};
export const whenRestored = (): Promise<void> => restoring ?? Promise.resolve();
const finishRestore = () => endRestore();

/**
 * Queued transaction writes are persisted while paused (offline) and while pending (waiting for a
 * confirmed identity, backing off or in flight), so killing the app never loses them. Other mutations
 * are online-only and are never persisted.
 */
export const shouldPersistMutation = (m: Mutation): boolean =>
  m.state.isPaused ||
  (m.state.status === "pending" &&
    m.options.mutationKey?.[0] === "transactions");
const dehydrateOptions: DehydrateOptions = {
  shouldDehydrateMutation: shouldPersistMutation,
};

/** A pending write restored from storage resumes like a paused one (it never ran in this process). */
function pauseRestoredWrites(
  client: PersistedClient | undefined,
): PersistedClient | undefined {
  client?.clientState.mutations.forEach((m) => {
    if (m.state.status === "pending")
      (m.state as { isPaused: boolean }).isPaused = true;
  });
  return client;
}

export const persister: Persister = {
  persistClient: (client) => {
    const snapshot = { ...client };
    snapshotEpoch.set(snapshot, epoch);
    // The cache belongs to the confirmed user: record the owner next to it.
    const owner = getConfirmedUserId();
    const run = Promise.all([
      base.persistClient(snapshot),
      owner ? writeOwner(owner) : undefined,
    ])
      .then(() => undefined)
      .finally(() => inFlight.delete(run));
    inFlight.add(run);
    return run;
  },
  restoreClient: () => {
    restoring = new Promise<void>((resolve) => {
      endRestore = resolve;
    });
    return Promise.resolve(base.restoreClient()).then(pauseRestoredWrites);
  },
  removeClient: () => base.removeClient(),
};

/** Drops queued snapshots and waits for the write in progress, so a following removeClient() is final. */
export async function discardPendingPersistence(): Promise<void> {
  epoch += 1;
  await Promise.allSettled([...inFlight]);
}

/**
 * Restores the persisted cache. Paused writes are NOT resumed here: bindIdentity.ts resumes them once
 * the signed-in user is confirmed as the owner of this data.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE_MS,
        buster: CACHE_VERSION,
        dehydrateOptions,
      }}
      onSuccess={finishRestore}
      onError={finishRestore}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
