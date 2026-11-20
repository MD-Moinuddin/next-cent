import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  dehydrate,
  onlineManager,
  useQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import {
  registerTransactionMutations,
  TX_PUT_KEY,
} from "@/features/transactions/mutations";
import { api } from "@/lib/api";
import { clearLocalData } from "@/lib/query/clear";
import {
  CACHE_VERSION,
  discardPendingPersistence,
  PERSIST_KEY,
  QueryProvider,
} from "@/lib/query/persist";
import { createQueryClient, queryClient } from "@/lib/query/queryClient";
import { AuthProvider } from "./ClerkAuth";
import {
  getConfirmedUserId,
  OWNER_KEY,
  resetIdentity,
  useConfirmedUserId,
} from "./identity";

// Cold start: the app process starts with a cache (and queued writes) persisted by an earlier run.
// Real QueryClient, persister and AsyncStorage mock; Clerk's hooks and the API adapter are mocked.

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
const flush = () => new Promise<void>((r) => setImmediate(r));
const settle = () =>
  act(async () => {
    for (let i = 0; i < 30; i++) await flush();
  });

/** What an earlier run of the app left behind: user A's profile and one queued (paused) write. */
async function persistEarlierRun(owner: string | null) {
  const source: QueryClient = createQueryClient();
  registerTransactionMutations(source);
  source.setQueryData(["me"], { id: "a", marker: "A-secret" });
  onlineManager.setOnline(false);
  void source
    .getMutationCache()
    .build(source, { mutationKey: TX_PUT_KEY })
    .execute({ id: "t1", body })
    .catch(() => undefined);
  await flush();
  const clientState = dehydrate(source);
  expect(clientState.mutations).toHaveLength(1);
  await AsyncStorage.setItem(
    PERSIST_KEY,
    JSON.stringify({
      timestamp: Date.now(),
      buster: CACHE_VERSION,
      clientState,
    }),
  );
  if (owner) await AsyncStorage.setItem(OWNER_KEY, owner);
  source
    .getMutationCache()
    .getAll()
    .forEach((m) => m.destroy());
  source.clear();
  onlineManager.setOnline(true);
}

function Probe() {
  const confirmed = useConfirmedUserId();
  const me = useQuery<{ marker: string }>({
    queryKey: ["me"],
    queryFn: () => api.getMe() as never,
    enabled: confirmed !== null,
  });
  return (
    <Text testID="probe">{`${confirmed ?? "none"}|${me.data?.marker ?? "-"}`}</Text>
  );
}
const tree = () => (
  <AuthProvider>
    <QueryProvider>
      <Probe />
    </QueryProvider>
  </AuthProvider>
);
const probe = () => screen.getByTestId("probe").props.children as string;
const storedBlob = async () => AsyncStorage.getItem(PERSIST_KEY);

let unmount: (() => Promise<void>) | null = null;
async function start() {
  const view = await render(tree());
  unmount = async () => {
    await view.unmount();
  };
  return view;
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  resetIdentity();
  onlineManager.setOnline(true);
  mocked.getMe.mockImplementation(
    async () => ({ id: "b", marker: "B" }) as never,
  );
  mocked.putTransaction.mockResolvedValue({ id: "t1" } as never);
});
afterEach(async () => {
  await unmount?.();
  unmount = null;
  await act(async () => {
    await clearLocalData();
    await discardPendingPersistence();
  });
  await AsyncStorage.clear();
});

it("signed out at cold start: clears the cache, the queue and the owner, and never calls the API", async () => {
  await persistEarlierRun("user-a");
  Object.assign(mockAuth, { isLoaded: true, isSignedIn: false, userId: null });
  await start();
  await settle();
  // A real reconnect (offline, then online) must not resume anything.
  await act(async () => onlineManager.setOnline(false));
  await act(async () => onlineManager.setOnline(true));
  await settle();

  expect(queryClient.getQueryData(["me"])).toBeUndefined();
  expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  expect(await AsyncStorage.getItem(OWNER_KEY)).toBeNull();
  const blob = await storedBlob();
  expect(blob ?? "").not.toContain("A-secret");
  expect(blob ?? "").not.toContain("4200");
  expect(mocked.putTransaction).not.toHaveBeenCalled();
  expect(probe()).toBe("none|-");
});

it("signed in as user B with user A's cache: clears first, then shows only B's data", async () => {
  await persistEarlierRun("user-a");
  Object.assign(mockAuth, {
    isLoaded: true,
    isSignedIn: true,
    userId: "user-b",
  });
  const seenAtConfirm: unknown[] = [];
  mocked.getMe.mockImplementation(async () => {
    seenAtConfirm.push(getConfirmedUserId());
    return { id: "b", marker: "B" } as never;
  });
  await start();
  await waitFor(() => expect(probe()).toBe("user-b|B"));
  await settle();

  expect(seenAtConfirm).toEqual(["user-b"]);
  expect(mocked.putTransaction).not.toHaveBeenCalled(); // A's queued write is gone
  expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  expect(await AsyncStorage.getItem(OWNER_KEY)).toBe("user-b");
  expect((await storedBlob()) ?? "").not.toContain("A-secret");
});

it("signed in as the same owner: keeps the cache and resumes the queued write only after confirmation", async () => {
  await persistEarlierRun("user-a");
  // Offline cold start: the auth provider has not loaded yet.
  Object.assign(mockAuth, { isLoaded: false, isSignedIn: false, userId: null });
  const order: string[] = [];
  mocked.putTransaction.mockImplementation(async () => {
    order.push(`put as ${getConfirmedUserId()}`);
    return { id: "t1" } as never;
  });
  const view = await start();
  await settle();
  await act(async () => onlineManager.setOnline(false));
  await act(async () => onlineManager.setOnline(true)); // a real reconnect
  await settle();
  expect(mocked.putTransaction).not.toHaveBeenCalled();
  // Restored in memory (this probe reads the cache directly; the app layout does not render it).
  expect(probe()).toBe("none|A-secret");
  expect(queryClient.getMutationCache().getAll()).toHaveLength(1);

  Object.assign(mockAuth, {
    isLoaded: true,
    isSignedIn: true,
    userId: "user-a",
  });
  order.push("confirm");
  await view.rerender(tree());
  await waitFor(() => expect(mocked.putTransaction).toHaveBeenCalledTimes(1));
  await settle();

  expect(order).toEqual(["confirm", "put as user-a"]);
  expect(mocked.putTransaction).toHaveBeenCalledWith(
    "t1",
    expect.objectContaining({ amount_minor: 4200 }),
  );
  expect(await AsyncStorage.getItem(OWNER_KEY)).toBe("user-a");
});

it("signed in with no stored owner (first run after the upgrade): keeps the cache and records the owner", async () => {
  await persistEarlierRun(null);
  Object.assign(mockAuth, {
    isLoaded: true,
    isSignedIn: true,
    userId: "user-a",
  });
  mocked.getMe.mockImplementation(
    async () => ({ id: "a", marker: "A-fresh" }) as never,
  );
  await start();
  await waitFor(() => expect(mocked.putTransaction).toHaveBeenCalledTimes(1));
  await settle();
  expect(await AsyncStorage.getItem(OWNER_KEY)).toBe("user-a");
  expect(getConfirmedUserId()).toBe("user-a");
});

it("auth state unknown at cold start (not loaded): nothing is cleared and nothing is sent", async () => {
  await persistEarlierRun("user-a");
  Object.assign(mockAuth, { isLoaded: false, isSignedIn: false, userId: null });
  await start();
  await settle();
  await act(async () => onlineManager.setOnline(false));
  await act(async () => onlineManager.setOnline(true)); // a real reconnect
  await settle();

  expect(queryClient.getQueryData(["me"])).toEqual({
    id: "a",
    marker: "A-secret",
  });
  expect(queryClient.getMutationCache().getAll()).toHaveLength(1);
  expect(await AsyncStorage.getItem(OWNER_KEY)).toBe("user-a");
  expect(await storedBlob()).toContain("4200");
  expect(mocked.putTransaction).not.toHaveBeenCalled();
  expect(getConfirmedUserId()).toBeNull();
});
