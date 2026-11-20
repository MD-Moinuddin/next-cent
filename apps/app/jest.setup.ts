process.env.EXPO_PUBLIC_API_URL = "http://localhost:8000";
process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_placeholder";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("@react-native-community/netinfo", () =>
  require("@react-native-community/netinfo/jest/netinfo-mock.js"),
);
jest.mock("@clerk/expo", () => ({
  ClerkProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: false,
    getToken: async () => null,
    signOut: async () => {},
  }),
  useUser: () => ({ user: null }),
}));
jest.mock("@clerk/expo/legacy", () => ({
  useSignIn: () => ({ isLoaded: true, signIn: {}, setActive: async () => {} }),
  useSignUp: () => ({ isLoaded: true, signUp: {}, setActive: async () => {} }),
}));
jest.mock("@clerk/expo/token-cache", () => ({ tokenCache: undefined }));
jest.mock("expo-crypto", () => ({
  randomUUID: () => require("node:crypto").randomUUID(),
}));

// TanStack Query flushes subscriber updates from setTimeout(0), which can land outside a test's act
// scope under CPU load. A synchronous scheduler removes that timer hop.
import { notifyManager } from "@tanstack/react-query";
notifyManager.setScheduler((callback) => callback());
