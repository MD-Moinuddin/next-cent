import { useLayoutEffect, useMemo, type ReactNode } from "react";
import { setTokenGetter } from "@/lib/api";
import { useIdentityBinding } from "@/lib/auth/bindIdentity";
import { SessionContext, type SessionApi } from "@/lib/auth/session";
import { clearLocalData } from "@/lib/query/clear";
import { setSignedIn, useStubSignedIn } from "./store";

const TOKEN = "e2e-stub-token";
const USER_ID = "e2e-stub-user";

/** Test-only replacement for AuthProvider (swapped in by metro-e2e.js when EXPO_PUBLIC_E2E_STUB_AUTH=1). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const signedIn = useStubSignedIn();
  const userId = signedIn ? USER_ID : null;
  useIdentityBinding({ isLoaded: true, isSignedIn: signedIn, userId });
  useLayoutEffect(() => {
    setTokenGetter(async () => (signedIn ? TOKEN : null));
    return () => setTokenGetter(null);
  }, [signedIn]);
  const value = useMemo<SessionApi>(
    () => ({
      isLoaded: true,
      isSignedIn: signedIn,
      userId,
      getToken: async () => (signedIn ? TOKEN : null),
      signOut: async () => {
        setSignedIn(false);
        await clearLocalData();
      },
      deleteAuthAccount: async () => {
        setSignedIn(false);
        await clearLocalData();
      },
    }),
    [signedIn, userId],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
