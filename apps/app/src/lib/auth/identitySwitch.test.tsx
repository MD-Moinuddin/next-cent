import AsyncStorage from "@react-native-async-storage/async-storage";
import { dehydrate, onlineManager } from "@tanstack/react-query";
import { act, render } from "@testing-library/react-native";
import { Text } from "react-native";
import {
  registerTransactionMutations,
  TX_PUT_KEY,
} from "@/features/transactions/mutations";
import { api } from "@/lib/api";
import { clearLocalData } from "@/lib/query/clear";
import { NetworkError } from "@/lib/query/errors";
import {
  CACHE_VERSION,
  discardPendingPersistence,
  PERSIST_KEY,
  QueryProvider,
} from "@/lib/query/persist";
import { createQueryClient, queryClient } from "@/lib/query/queryClient";
import { AuthProvider } from "./ClerkAuth";
import { getConfirmedUserId, OWNER_KEY, resetIdentity } from "./identity";

// Auth changes reported by the provider itself (session expiry, another tab, a multi-session switch)
// while user A's restored writes are still retrying. Real gate, persister and QueryClient; only Clerk
// and the API adapter are mocked. Every API call records the identity it was sent under.

const mockAuth = {
  isLoaded: true as boolean,
  isSignedIn: true as boolean,
  userId: "user-a" as string | null,
  getToken: jest.fn(async () => "tok"),
  signOut: jest.fn(async () => {}),
};
jest.mock("@clerk/expo", () => ({
  ClerkProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => mockAuth,
  useUser: () => ({ user: null }),
}));
jest.mock("@/lib/api", () => ({
  api: {
    getMe: jest.fn(),
    getTransaction: jest.fn(),
    putTransaction: jest.fn(),
    deleteTransaction: jest.fn(),
    restoreTransaction: jest.fn(),
  },
  setTokenGetter: jest.fn(),
  getAuthToken: jest.fn(),
}));
const mocked = jest.mocked(api);

const body = {
  kind: "expense" as const,
  amount_minor: 4200,
  currency: "EUR",
  occurred_on: "2026-11-02",
  category_id: "c1",
  tags: [],
};
const calls: string[] = []; // "<api call> as <confirmed identity at send time>"
const record = (name: string) =>
  calls.push(`${name} as ${getConfirmedUserId()}`);

/** Advances fake time and drains promise chains inside act. */
const tick = (ms = 0) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

/** User A's earlier run: one queued write per id, persisted while offline. */
async function persistQueuedWrites(vars: object[]) {
  const source = createQueryClient();
  registerTransactionMutations(source);
  onlineManager.setOnline(false);
  for (const v of vars)
    void source
      .getMutationCache()
      .build(source, { mutationKey: TX_PUT_KEY })
      .execute(v)
      .catch(() => undefined);
  await jest.advanceTimersByTimeAsync(0);
  const clientState = dehydrate(source);
  expect(clientState.mutations).toHaveLength(vars.length);
  await AsyncStorage.setItem(
    PERSIST_KEY,
    JSON.stringify({
      timestamp: Date.now(),
      buster: CACHE_VERSION,
      clientState,
    }),
  );
  await AsyncStorage.setItem(OWNER_KEY, "user-a");
  source
    .getMutationCache()
    .getAll()
    .forEach((m) => m.destroy());
  source.clear();
  onlineManager.setOnline(true);
}

const tree = () => (
  <AuthProvider>
    <QueryProvider>
      <Text>app</Text>
    </QueryProvider>
  </AuthProvider>
);
let view: Awaited<ReturnType<typeof render>> | null = null;
async function startAs(userId: string | null) {
  Object.assign(mockAuth, {
    isLoaded: true,
    isSignedIn: userId !== null,
    userId,
  });
  view = await render(tree());
}
async function authChange(userId: string | null) {
  Object.assign(mockAuth, { isSignedIn: userId !== null, userId });
  await view!.rerender(tree());
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  calls.length = 0;
  await AsyncStorage.clear();
  resetIdentity();
  onlineManager.setOnline(true);
});
afterEach(async () => {
  await view?.unmount();
  view = null;
  await act(async () => {
    const done = clearLocalData().then(discardPendingPersistence);
    await jest.advanceTimersByTimeAsync(15_000);
    await done;
  });
  await AsyncStorage.clear();
  jest.useRealTimers();
});

it("a sign-out reported by the provider is not blocked by retrying writes, and nothing more is sent", async () => {
  await persistQueuedWrites([
    { id: "t1", body },
    { id: "t2", body },
  ]);
  mocked.putTransaction.mockImplementation(async () => {
    record("put");
    throw new NetworkError(new Error("server down")); // retried for about a minute
  });
  await startAs("user-a");
  await tick(0);
  await tick(2_500); // first attempts and a retry or two
  expect(calls.length).toBeGreaterThan(0);
  const sentBeforeSignOut = calls.length;

  await authChange(null); // session expired elsewhere: no Sign out button involved
  expect(getConfirmedUserId()).toBeNull(); // dropped synchronously with the commit
  await tick(0);
  // The clear ran without waiting for the retries to finish.
  expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  await tick(120_000);
  expect(calls).toHaveLength(sentBeforeSignOut);
  expect(calls.every((c) => c === "put as user-a")).toBe(true);

  await authChange("user-b");
  await tick(120_000);
  expect(getConfirmedUserId()).toBe("user-b");
  expect(calls).toHaveLength(sentBeforeSignOut); // nothing under B, ever
});

it("a switch from A to B while A's write is backing off: the write never reaches the API under B", async () => {
  await persistQueuedWrites([{ id: "t1", body }]);
  mocked.putTransaction.mockImplementation(async () => {
    record("put");
    throw new NetworkError(new Error("flaky"));
  });
  await startAs("user-a");
  await tick(0);
  expect(calls).toEqual(["put as user-a"]); // now waiting about a second before the retry

  await authChange("user-b"); // multi-session switch, no sign-out in between
  expect(getConfirmedUserId()).toBeNull();
  await tick(120_000);
  expect(getConfirmedUserId()).toBe("user-b");
  expect(calls).toEqual(["put as user-a"]);
  expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
});

it("a switch while a rebase is between its read and its write: the write is not sent under B", async () => {
  await persistQueuedWrites([{ id: "t1", body, rebase: true }]);
  let releaseRead: (v: unknown) => void = () => undefined;
  mocked.getTransaction.mockImplementation(() => {
    record("get");
    return new Promise((resolve) => (releaseRead = resolve)) as never;
  });
  mocked.putTransaction.mockImplementation(async () => {
    record("put");
    return { id: "t1" } as never;
  });
  await startAs("user-a");
  await tick(0);
  expect(calls).toEqual(["get as user-a"]); // the GET is on the wire

  await authChange("user-b");
  releaseRead({ id: "t1", version: 3 }); // the response arrives after the switch
  await tick(120_000);
  expect(mocked.putTransaction).not.toHaveBeenCalled();
  expect(calls).toEqual(["get as user-a"]);
  expect(getConfirmedUserId()).toBe("user-b");
});

it("same user: the restored write resumes and completes", async () => {
  await persistQueuedWrites([{ id: "t1", body }]);
  mocked.putTransaction.mockImplementation(async () => {
    record("put");
    return { id: "t1" } as never;
  });
  await startAs("user-a");
  await tick(1_000);
  expect(calls).toEqual(["put as user-a"]);
  expect(
    queryClient
      .getMutationCache()
      .getAll()
      .map((m) => m.state.status),
  ).toEqual(["success"]);
});

it("unknown (not loaded) auth state changes nothing and sends nothing", async () => {
  await persistQueuedWrites([{ id: "t1", body }]);
  mocked.putTransaction.mockImplementation(async () => {
    record("put");
    return { id: "t1" } as never;
  });
  Object.assign(mockAuth, { isLoaded: false, isSignedIn: false, userId: null });
  view = await render(tree());
  await tick(60_000);
  expect(calls).toEqual([]);
  expect(queryClient.getMutationCache().getAll()).toHaveLength(1);
  expect(await AsyncStorage.getItem(OWNER_KEY)).toBe("user-a");
});
