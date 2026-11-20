import { Redirect } from "expo-router";
import type { ReactNode } from "react";
import { useIdentityConfirmed } from "./identity";
import { useSession } from "./session";

/**
 * For routes outside the (app) group (quick add, transaction detail): render only for a signed-in user
 * whose ownership of the local data is confirmed, so restored data never reaches another identity.
 */
export function RequireIdentity({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useSession();
  const confirmed = useIdentityConfirmed(userId);
  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (!confirmed) return null;
  return <>{children}</>;
}
