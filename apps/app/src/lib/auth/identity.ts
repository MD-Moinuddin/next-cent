import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

/**
 * Binds local data (persisted cache, queued writes) to one signed-in user.
 *
 * - The OWNER of the persisted cache is stored under its own key; clearLocalData() removes it.
 * - The CONFIRMED identity is the signed-in user whose ownership of the local data was checked
 *   after the auth provider loaded (see bindIdentity.ts). Until then the app renders no cached data
 *   and queued writes wait in `authReady()`.
 */
export const OWNER_KEY = "nextcent-cache-owner";

/** A queued write was waiting for an identity that went away (sign-out or another user). */
export class IdentityChangedError extends Error {
  constructor() {
    super("The signed-in identity changed; the queued change was discarded");
    this.name = "IdentityChangedError";
  }
}

let confirmed: string | null = null;
let waiters: { resolve: () => void; reject: (e: unknown) => void }[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const getConfirmedUserId = (): string | null => confirmed;

export function confirmIdentity(userId: string): void {
  confirmed = userId;
  const ready = waiters;
  waiters = [];
  ready.forEach((w) => w.resolve());
  notify();
}

/**
 * Suspends the confirmed identity at once (sign-out or user change reported by the auth provider),
 * before any async reconciliation. Waiting writes keep waiting at the gate; writes past the gate are
 * stopped by the per-request check in `assertIdentity`. clearLocalData() then discards them.
 */
export function suspendIdentity(): void {
  if (confirmed === null) return;
  confirmed = null;
  notify();
}

/** Throws unless `owner` is still the confirmed identity (checked right before every API request). */
export function assertIdentity(owner: string): void {
  if (confirmed !== owner) throw new IdentityChangedError();
}

/** Forgets the confirmed identity. Work still waiting for it belonged to that identity: abandon it. */
export function resetIdentity(): void {
  confirmed = null;
  const abandoned = waiters;
  waiters = [];
  abandoned.forEach((w) => w.reject(new IdentityChangedError()));
  notify();
}

/**
 * Resolves with the confirmed user id once a signed-in identity is confirmed; while signed out or
 * unknown it simply waits.
 */
export async function authReady(): Promise<string> {
  while (confirmed === null)
    await new Promise<void>((resolve, reject) =>
      waiters.push({ resolve, reject }),
    );
  return confirmed;
}

export function useConfirmedUserId(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => confirmed,
    () => confirmed,
  );
}

/** True only when the local data is confirmed to belong to `userId` (the current session's user). */
export function useIdentityConfirmed(userId: string | null): boolean {
  const current = useConfirmedUserId();
  return userId !== null && current === userId;
}

export const readOwner = (): Promise<string | null> =>
  AsyncStorage.getItem(OWNER_KEY);
export const writeOwner = (userId: string): Promise<void> =>
  AsyncStorage.setItem(OWNER_KEY, userId);
export const removeOwner = (): Promise<void> =>
  AsyncStorage.removeItem(OWNER_KEY);
