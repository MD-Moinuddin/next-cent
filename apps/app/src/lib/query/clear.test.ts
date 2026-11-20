import AsyncStorage from "@react-native-async-storage/async-storage";
import { dehydrate, onlineManager } from "@tanstack/react-query";
import {
  clearRemovedCache,
  TX_DELETE_KEY,
  TX_PUT_KEY,
  TX_RESTORE_KEY,
} from "@/features/transactions/mutations";
import {
  confirmIdentity,
  getConfirmedUserId,
  OWNER_KEY,
} from "@/lib/auth/identity";
import { clearLocalData } from "./clear";
import { PERSIST_KEY, persister } from "./persist";
import { queryClient } from "./queryClient";

jest.mock("@/lib/api", () => ({
  api: {
    putTransaction: jest.fn(),
    deleteTransaction: jest.fn(),
    restoreTransaction: jest.fn(),
  },
  setTokenGetter: jest.fn(),
}));

it("leaves no financial data in memory or in persisted storage", async () => {
  queryClient.setQueryData(["transactions", "list", {}], {
    pages: [{ items: [{ id: "a", amount_minor: 100 }] }],
  });
  queryClient.setQueryData(["me"], { home_currency: "EUR" });
  await persister.persistClient({
    timestamp: Date.now(),
    buster: "1",
    clientState: { mutations: [], queries: [] },
  });
  expect(await AsyncStorage.getItem(PERSIST_KEY)).not.toBeNull();

  onlineManager.setOnline(false);
  void queryClient
    .getMutationCache()
    .build(queryClient, { mutationKey: ["x"], mutationFn: async () => 1 })
    .execute(undefined)
    .catch(() => undefined);
  expect(queryClient.getMutationCache().getAll()).toHaveLength(1);

  await clearLocalData();
  onlineManager.setOnline(true);

  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  expect(await AsyncStorage.getItem(PERSIST_KEY)).toBeNull();
  expect(await AsyncStorage.getAllKeys()).toEqual([]);
});

describe("with real paused mutations", () => {
  it("removes the persisted blob and the in-memory mutations, even after a throttled trailing write", async () => {
    onlineManager.setOnline(false);
    const body = {
      kind: "expense",
      amount_minor: 4200,
      currency: "EUR",
      occurred_on: "2026-11-02",
      tags: [],
    };
    void queryClient
      .getMutationCache()
      .build(queryClient, { mutationKey: TX_PUT_KEY })
      .execute({ id: "t1", body });
    void queryClient
      .getMutationCache()
      .build(queryClient, { mutationKey: TX_DELETE_KEY })
      .execute("t1");
    await new Promise<void>((r) => setImmediate(() => r()));

    const state = () => ({
      timestamp: Date.now(),
      buster: "1",
      clientState: dehydrate(queryClient),
    });
    await persister.persistClient(state());
    const blob = (await AsyncStorage.getItem(PERSIST_KEY)) ?? "";
    expect(blob).toContain("4200"); // real financial data was persisted
    expect(JSON.parse(blob).clientState.mutations).toHaveLength(2);
    void persister.persistClient(state()); // queued trailing write that would otherwise resurrect data

    await clearLocalData();
    onlineManager.setOnline(true);
    await new Promise((r) => setTimeout(r, 1200)); // let the persister throttle window pass

    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(await AsyncStorage.getItem(PERSIST_KEY)).toBeNull();
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});

afterEach(() => {
  onlineManager.setOnline(true);
  queryClient
    .getMutationCache()
    .getAll()
    .forEach((m) => m.destroy());
  queryClient.clear();
});

it("also forgets rows cached for undoing a queued delete", async () => {
  const row = { id: "t9", merchant: "Secret shop", amount_minor: 999 };
  queryClient.setQueryData(["transactions", "list", {}], {
    pages: [{ items: [row] }],
    pageParams: [undefined],
  });
  onlineManager.setOnline(false);
  void queryClient
    .getMutationCache()
    .build(queryClient, { mutationKey: TX_DELETE_KEY })
    .execute("t9");
  await new Promise<void>((r) => setImmediate(() => r()));
  await clearLocalData();
  // After clearing, a restore must not resurrect the deleted row from the module-level cache.
  queryClient.setQueryData(["transactions", "list", {}], {
    pages: [{ items: [] }],
    pageParams: [undefined],
  });
  void queryClient
    .getMutationCache()
    .build(queryClient, { mutationKey: TX_RESTORE_KEY })
    .execute("t9");
  await new Promise<void>((r) => setImmediate(() => r()));
  const data = queryClient.getQueryData<{ pages: { items: unknown[] }[] }>([
    "transactions",
    "list",
    {},
  ]);
  expect(data?.pages[0]?.items).toEqual([]);
  clearRemovedCache(); // exported and idempotent
  await clearLocalData();
});

it("forgets the cache owner and the confirmed identity", async () => {
  confirmIdentity("user-a");
  await AsyncStorage.setItem(OWNER_KEY, "user-a");
  await clearLocalData();
  expect(await AsyncStorage.getItem(OWNER_KEY)).toBeNull();
  expect(getConfirmedUserId()).toBeNull();
});
