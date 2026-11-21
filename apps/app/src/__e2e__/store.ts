import { useSyncExternalStore } from "react";

// Test-only sign-in state (see metro-e2e.js). Persisted in localStorage so Playwright can pre-seed it.
if (process.env.EXPO_PUBLIC_E2E_STUB_AUTH !== "1") {
  throw new Error("The E2E auth stub is only for the dedicated E2E build.");
}

// Unique marker: scripts/assert-no-e2e-stub.mjs looks for it in exported bundles. Keep it in sync with the script.
(globalThis as Record<string, unknown>)["__NEXTCENT_E2E_STUB_AUTH__"] = true;

const KEY = "nextcent-e2e-signed-in";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
let signedIn = read();

export function setSignedIn(value: boolean): void {
  signedIn = value;
  try {
    if (value) globalThis.localStorage?.setItem(KEY, "1");
    else globalThis.localStorage?.removeItem(KEY);
  } catch {
    // storage unavailable: keep the in-memory value
  }
  listeners.forEach((l) => l());
}

export function useStubSignedIn(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => signedIn,
    () => false,
  );
}
