import { createContext, useContext } from "react";

export interface SessionApi {
  isLoaded: boolean;
  isSignedIn: boolean;
  /** The signed-in user's id (null when signed out or not loaded). */
  userId: string | null;
  getToken(): Promise<string | null>;
  signOut(): Promise<void>;
  deleteAuthAccount(): Promise<void>;
}
export const SessionContext = createContext<SessionApi | null>(null);
export function useSession(): SessionApi {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <AuthProvider>");
  return value;
}
