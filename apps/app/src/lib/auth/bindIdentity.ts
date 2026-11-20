import { useLayoutEffect } from "react";
import { clearLocalData } from "@/lib/query/clear";
import { whenRestored } from "@/lib/query/persist";
import { queryClient } from "@/lib/query/queryClient";
import {
  confirmIdentity,
  getConfirmedUserId,
  readOwner,
  suspendIdentity,
  writeOwner,
} from "./identity";

export interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
}

let chain: Promise<void> = Promise.resolve();
let latest = 0;

/**
 * Decides, after the auth provider has loaded, whether the local data may be used:
 * - not loaded (for example offline at cold start): do nothing, never clear on an unknown state;
 * - signed out: clearLocalData(), so a signed-out device holds no financial data or queued writes;
 * - signed in as someone other than the stored owner: clearLocalData(), then record the new owner;
 * - signed in with no stored owner (first run after this change): record the owner, keep the data.
 * Then the identity is confirmed: the app may render cached data and queued writes may resume.
 *
 * Calls run one after another; a call that is overtaken by a newer auth state does not confirm.
 */
export function reconcileIdentity(state: AuthState): Promise<void> {
  const ticket = ++latest;
  chain = chain
    .then(() => apply(state, ticket))
    .catch(() => {
      // Fail closed: the identity stays unconfirmed (nothing is rendered or sent) until the next change.
    });
  return chain;
}

async function apply(
  { isLoaded, isSignedIn, userId }: AuthState,
  ticket: number,
): Promise<void> {
  if (!isLoaded) return;
  await whenRestored(); // a clear must not be undone by a hydrate that finishes afterwards
  if (!isSignedIn) {
    await clearLocalData();
    return;
  }
  if (!userId || getConfirmedUserId() === userId) return;
  const owner = await readOwner();
  if (owner !== null && owner !== userId) await clearLocalData();
  if (ticket !== latest) return; // a newer auth state is queued; it decides
  await writeOwner(userId);
  confirmIdentity(userId);
  // Not awaited: restored writes may retry for a long time, and a later auth change (sign-out, another
  // user) must never wait behind them. Their failures surface through the normal mutation error path.
  void queryClient
    .resumePausedMutations()
    .catch(() => undefined)
    .then(() => queryClient.invalidateQueries());
}

/**
 * Synchronous part of an auth change: a sign-out or a different user drops the confirmed identity
 * immediately, so no write is sent for the old identity while the async reconciliation runs.
 * An unknown (not loaded) state changes nothing.
 */
export function suspendOnAuthChange({
  isLoaded,
  isSignedIn,
  userId,
}: AuthState): void {
  if (!isLoaded) return;
  if (!isSignedIn || userId !== getConfirmedUserId()) suspendIdentity();
}

/** Used by the auth provider (and the E2E stub) to keep the local data bound to the signed-in user. */
export function useIdentityBinding({
  isLoaded,
  isSignedIn,
  userId,
}: AuthState): void {
  // Layout effect: runs right after the commit that carries the auth change, before passive effects.
  useLayoutEffect(() => {
    suspendOnAuthChange({ isLoaded, isSignedIn, userId });
    void reconcileIdentity({ isLoaded, isSignedIn, userId });
  }, [isLoaded, isSignedIn, userId]);
}
