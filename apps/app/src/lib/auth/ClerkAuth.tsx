import { ClerkProvider, useAuth, useUser } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { useLayoutEffect, useMemo, type ReactNode } from "react";
import { setTokenGetter } from "@/lib/api";
import { config } from "@/lib/config";
import { clearLocalData } from "@/lib/query/clear";
import { useIdentityBinding } from "./bindIdentity";
import { SessionContext, type SessionApi } from "./session";

function Bridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useAuth();
  const { user } = useUser();
  // Layout effects of this provider run before any passive effect (such as a query's first fetch) in
  // its children, so the first request already carries a token.
  useLayoutEffect(() => {
    setTokenGetter(() => getToken());
    return () => setTokenGetter(null);
  }, [getToken]);

  // Binds the persisted cache and queued writes to the signed-in user, also at cold start: signed out
  // or a different user clears them before anything is shown or sent (see bindIdentity.ts).
  const currentUserId = isLoaded && isSignedIn ? (userId ?? null) : null;
  useIdentityBinding({
    isLoaded,
    isSignedIn: !!isSignedIn,
    userId: currentUserId,
  });

  const value = useMemo<SessionApi>(
    () => ({
      isLoaded,
      isSignedIn: !!isSignedIn,
      userId: currentUserId,
      getToken: () => getToken(),
      signOut: async () => {
        await signOut();
        await clearLocalData();
      },
      deleteAuthAccount: async () => {
        if (!user) throw new Error("No signed-in user to delete");
        await user.delete();
        await clearLocalData();
      },
    }),
    [isLoaded, isSignedIn, currentUserId, getToken, signOut, user],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={config.clerkPublishableKey}
      tokenCache={tokenCache}
    >
      <Bridge>{children}</Bridge>
    </ClerkProvider>
  );
}
