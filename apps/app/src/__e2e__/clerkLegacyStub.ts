import { setSignedIn } from "./store";

// Test-only stand-in for the `@clerk/expo/legacy` hooks used by the sign-in and sign-up screens.
if (process.env.EXPO_PUBLIC_E2E_STUB_AUTH !== "1") {
  throw new Error("The E2E auth stub is only for the dedicated E2E build.");
}

const setActive = async () => setSignedIn(true);
const complete = async () => ({
  status: "complete" as const,
  createdSessionId: "e2e-session",
});

export function useSignIn() {
  return { isLoaded: true, setActive, signIn: { create: complete } };
}

export function useSignUp() {
  return {
    isLoaded: true,
    setActive,
    signUp: {
      create: async () => ({}),
      prepareEmailAddressVerification: async () => ({}),
      attemptEmailAddressVerification: complete,
    },
  };
}
