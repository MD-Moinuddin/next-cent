import {
  dehydrate,
  hydrate,
  onlineManager,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query";
import { ApiError, NetworkError } from "@/lib/query/errors";
import { createQueryClient } from "@/lib/query/queryClient";
import { api } from "@/lib/api";
import type { TransactionOut } from "@/lib/types";
import {
  TX_DELETE_KEY,
  TX_PUT_KEY,
  TX_RESTORE_KEY,
  newTransactionId,
  registerTransactionMutations,
} from "./mutations";
import { confirmIdentity } from "@/lib/auth/identity";

jest.mock("@/lib/api", () => ({
  api: {
    putTransaction: jest.fn(),
    deleteTransaction: jest.fn(),
    restoreTransaction: jest.fn(),
  },
  setTokenGetter: jest.fn(),
}));

const mocked = api as unknown as Record<
  "putTransaction" | "deleteTransaction" | "restoreTransaction",
  jest.Mock
>;
const body = {
  kind: "expense" as const,
  amount_minor: 250,
  currency: "EUR",
  occurred_on: "2026-11-02",
  category_id: null,
  tags: [],
};

function deferred<T = unknown>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>((r) => setImmediate(r));

let client: QueryClient;
beforeEach(() => {
  // Queued writes wait for a confirmed signed-in identity (lib/auth/identity.ts).
  confirmIdentity("test-user");
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  client = createQueryClient();
  registerTransactionMutations(client);
});
// MutationCache.clear() does not cancel a mutation's 7-day gc timer; destroy them so Jest can exit.
const dispose = (c: QueryClient) => {
  c.getMutationCache()
    .getAll()
    .forEach((m) => m.destroy());
  c.clear();
};
afterEach(() => {
  dispose(client);
  onlineManager.setOnline(true);
});

const run = (key: readonly string[], vars: unknown) =>
  client.getMutationCache().build(client, { mutationKey: key }).execute(vars);

const tx = (
  id: string,
  occurred_on: string,
  extra: Partial<TransactionOut> = {},
): TransactionOut => ({
  id,
  kind: "expense",
  amount_minor: 1,
  currency: "EUR",
  occurred_on,
  category_id: null,
  merchant: null,
  note: null,
  recurring_id: null,
  tags: [],
  version: 1,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  deleted_at: null,
  ...extra,
});

describe("offline mutation queue", () => {
  it("registers defaults (fn, shared scope) for every transaction mutation key", () => {
    for (const key of [TX_PUT_KEY, TX_DELETE_KEY, TX_RESTORE_KEY]) {
      const d = client.getMutationDefaults(key);
      expect(typeof d?.mutationFn).toBe("function");
      expect(d?.scope).toEqual({ id: "transactions" });
    }
  });

  it("runs a queued create and the following undo (delete) strictly in order", async () => {
    const order: string[] = [];
    const put = deferred();
    mocked.putTransaction.mockImplementation(async () => {
      order.push("put:start");
      await put.promise;
      order.push("put:end");
    });
    mocked.deleteTransaction.mockImplementation(async () => {
      order.push("delete:start");
    });
    const p1 = run(TX_PUT_KEY, { id: "t1", body });
    const p2 = run(TX_DELETE_KEY, "t1");
    await flush();
    expect(order).toEqual(["put:start"]); // delete must wait for the create
    put.resolve(undefined);
    await Promise.all([p1, p2]);
    expect(order).toEqual(["put:start", "put:end", "delete:start"]);
    expect(mocked.deleteTransaction).toHaveBeenCalledWith("t1");
  });

  it("keeps a restore queued behind a delete", async () => {
    const order: string[] = [];
    const del = deferred();
    mocked.deleteTransaction.mockImplementation(async () => {
      order.push("delete");
      await del.promise;
    });
    mocked.restoreTransaction.mockImplementation(async () => {
      order.push("restore");
    });
    const p1 = run(TX_DELETE_KEY, "t1");
    const p2 = run(TX_RESTORE_KEY, "t1");
    await flush();
    expect(order).toEqual(["delete"]);
    del.resolve(undefined);
    await Promise.all([p1, p2]);
    expect(order).toEqual(["delete", "restore"]);
  });

  it("pauses while offline and resumes in order when the app comes online", async () => {
    client.mount();
    onlineManager.setOnline(false);
    const calls: string[] = [];
    mocked.putTransaction.mockImplementation(
      async () => void calls.push("put"),
    );
    mocked.deleteTransaction.mockImplementation(
      async () => void calls.push("delete"),
    );
    const p1 = run(TX_PUT_KEY, { id: "t1", body });
    const p2 = run(TX_DELETE_KEY, "t1");
    await flush();
    expect(calls).toEqual([]);
    expect(
      client
        .getMutationCache()
        .getAll()
        .every((m) => m.state.isPaused),
    ).toBe(true);
    onlineManager.setOnline(true);
    await Promise.all([p1, p2]);
    expect(calls).toEqual(["put", "delete"]);
    client.unmount();
  });

  it("resumes a paused mutation after dehydrate/hydrate into a new client (app restart)", async () => {
    onlineManager.setOnline(false);
    void run(TX_PUT_KEY, { id: "t9", body });
    await flush();
    const snapshot = JSON.parse(JSON.stringify(dehydrate(client)));
    expect(snapshot.mutations).toHaveLength(1);

    const restarted = createQueryClient();
    registerTransactionMutations(restarted);
    hydrate(restarted, snapshot);
    onlineManager.setOnline(true);
    mocked.putTransaction.mockResolvedValue({ id: "t9" });
    await restarted.resumePausedMutations();
    expect(mocked.putTransaction).toHaveBeenCalledWith("t9", body);
    dispose(restarted);
  });

  it("does not retry a 4xx error", async () => {
    mocked.putTransaction.mockRejectedValue(
      new ApiError(422, { code: "invalid_amount" }),
    );
    await expect(run(TX_PUT_KEY, { id: "t1", body })).rejects.toMatchObject({
      status: 422,
    });
    expect(mocked.putTransaction).toHaveBeenCalledTimes(1);
  });

  it("retries a network error and then succeeds", async () => {
    jest.useFakeTimers();
    try {
      mocked.putTransaction
        .mockRejectedValueOnce(new NetworkError(new Error("down")))
        .mockResolvedValueOnce({ id: "t1" });
      const p = run(TX_PUT_KEY, { id: "t1", body });
      await jest.advanceTimersByTimeAsync(5_000);
      await expect(p).resolves.toEqual({ id: "t1" });
      expect(mocked.putTransaction).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("optimistic cache updates", () => {
  it("shows a queued create in the cached list immediately, and removes it on queued delete", async () => {
    onlineManager.setOnline(false);
    const key = ["transactions", "list", {}];
    client.setQueryData(key, {
      pages: [{ items: [tx("a", "2026-11-10")], next_cursor: null }],
      pageParams: [undefined],
    });
    void run(TX_PUT_KEY, {
      id: "n",
      body: { ...body, occurred_on: "2026-11-12" },
    });
    await flush();
    const ids = () =>
      (
        client.getQueryData(key) as { pages: { items: TransactionOut[] }[] }
      ).pages[0]!.items.map((t) => t.id);
    expect(ids()).toEqual(["n", "a"]);
    void run(TX_DELETE_KEY, "n");
    await flush();
    expect(ids()).toEqual(["a"]);
  });
});

type Lists = { pages: { items: TransactionOut[] }[] };
const idsAt = (key: unknown[]) =>
  (client.getQueryData(key) as Lists).pages[0]!.items.map((t) => t.id);
const seed = (key: unknown[], items: TransactionOut[]) =>
  client.setQueryData(key, {
    pages: [{ items, next_cursor: null }],
    pageParams: [undefined],
  });

describe("optimistic updates respect list filters", () => {
  it("inserts only into matching lists and still replaces existing rows", async () => {
    onlineManager.setOnline(false);
    const a = tx("a", "2026-11-10");
    const all = ["transactions", "list", {}];
    const income = ["transactions", "list", { kind: "income" }];
    const expense = ["transactions", "list", { kind: "expense" }];
    const search = ["transactions", "list", { q: "x" }];
    const cat = ["transactions", "list", { category_id: "other" }];
    for (const k of [all, income, expense, search, cat]) seed(k, [a]);
    void run(TX_PUT_KEY, {
      id: "n",
      body: {
        ...body,
        kind: "expense",
        category_id: "c1",
        occurred_on: "2026-11-12",
      },
    });
    await flush();
    expect(idsAt(all)).toEqual(["n", "a"]);
    expect(idsAt(expense)).toEqual(["n", "a"]);
    expect(idsAt(income)).toEqual(["a"]);
    expect(idsAt(search)).toEqual(["a"]);
    expect(idsAt(cat)).toEqual(["a"]);
    void run(TX_PUT_KEY, {
      id: "a",
      body: { ...body, base_version: 1, merchant: "Edited" },
    });
    await flush();
    expect(idsAt(search)).toEqual(["a"]);
    expect(
      (client.getQueryData(search) as { pages: { items: TransactionOut[] }[] })
        .pages[0]!.items[0]!.merchant,
    ).toBe("Edited");
  });

  it("keeps created_at, recurring_id and version when editing a list-only row", async () => {
    onlineManager.setOnline(false);
    const a = tx("a", "2026-11-10", {
      recurring_id: "r1",
      version: 4,
      created_at: "2026-09-01T00:00:00Z",
    });
    const key = ["transactions", "list", {}];
    seed(key, [a]);
    void run(TX_PUT_KEY, { id: "a", body: { ...body, base_version: 4 } });
    await flush();
    expect(
      client.getQueryData<TransactionOut>(["transactions", "detail", "a"]),
    ).toMatchObject({
      recurring_id: "r1",
      version: 4,
      created_at: "2026-09-01T00:00:00Z",
    });
  });

  it("puts a deleted row back when a restore (undo) is queued", async () => {
    onlineManager.setOnline(false);
    const key = ["transactions", "list", {}];
    seed(key, [tx("a", "2026-11-10"), tx("b", "2026-11-01")]);
    void run(TX_DELETE_KEY, "a");
    await flush();
    expect(idsAt(key)).toEqual(["b"]);
    void run(TX_RESTORE_KEY, "a");
    await flush();
    expect(idsAt(key)).toEqual(["a", "b"]);
  });
});

describe("rollback and reconciliation", () => {
  const listKey = ["transactions", "list", {}];
  function watchServer(rows: () => TransactionOut[]) {
    const obs = new QueryObserver(client, {
      queryKey: listKey,
      queryFn: async () => ({
        pages: [{ items: rows(), next_cursor: null }],
        pageParams: [undefined],
      }),
    });
    const unsub = obs.subscribe(() => {});
    return unsub;
  }

  it("reverts the optimistic row via refetch after a non-retryable failure", async () => {
    const server = [tx("a", "2026-11-10")];
    const unsub = watchServer(() => server);
    await flush();
    const spy = jest.spyOn(client, "invalidateQueries");
    const gate = deferred();
    mocked.putTransaction.mockImplementation(() => gate.promise);
    const p = run(TX_PUT_KEY, { id: "n", body }).catch((e: unknown) => e);
    await flush();
    expect(idsAt(listKey)).toEqual(["a", "n"]);
    gate.reject(new ApiError(422, { code: "invalid_amount" }));
    await p;
    await flush();
    expect(spy).toHaveBeenCalledWith({ queryKey: ["transactions"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["summary"] });
    expect(idsAt(listKey)).toEqual(["a"]);
    unsub();
  });

  it("leaves no stale state when a retryable failure later succeeds", async () => {
    jest.useFakeTimers();
    try {
      const server = [tx("a", "2026-11-10")];
      const unsub = watchServer(() => server);
      await jest.advanceTimersByTimeAsync(10);
      mocked.putTransaction
        .mockRejectedValueOnce(new NetworkError(new Error("down")))
        .mockImplementationOnce(async () => {
          server.push(tx("n", "2026-11-02"));
          return { id: "n" };
        });
      const p = run(TX_PUT_KEY, { id: "n", body });
      await jest.advanceTimersByTimeAsync(5_000);
      await p;
      await jest.advanceTimersByTimeAsync(10);
      expect(idsAt(listKey)).toEqual(["a", "n"]);
      unsub();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("restart ordering", () => {
  it("replays a paused create then delete of the same id in order after hydration", async () => {
    onlineManager.setOnline(false);
    void run(TX_PUT_KEY, { id: "t5", body });
    void run(TX_DELETE_KEY, "t5");
    await flush();
    const snapshot = JSON.parse(JSON.stringify(dehydrate(client)));
    expect(
      snapshot.mutations.map(
        (m: { mutationKey: string[] }) => m.mutationKey[1],
      ),
    ).toEqual(["put", "delete"]);

    const restarted = createQueryClient();
    registerTransactionMutations(restarted);
    hydrate(restarted, snapshot);
    const order: string[] = [];
    mocked.putTransaction.mockImplementation(
      async () => void order.push("put"),
    );
    mocked.deleteTransaction.mockImplementation(
      async () => void order.push("delete"),
    );
    onlineManager.setOnline(true);
    await restarted.resumePausedMutations();
    expect(order).toEqual(["put", "delete"]);
    dispose(restarted);
  });
});

it("creates RFC 4122 v4 transaction ids", () => {
  expect(newTransactionId()).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  expect(newTransactionId()).not.toBe(newTransactionId());
});

describe("detail cache follows delete and restore", () => {
  const row = {
    id: "d1",
    kind: "expense",
    amount_minor: 250,
    currency: "EUR",
    occurred_on: "2026-11-02",
    category_id: null,
    merchant: null,
    note: null,
    recurring_id: null,
    tags: [],
    version: 2,
    created_at: "2026-11-02T00:00:00Z",
    updated_at: "2026-11-02T00:00:00Z",
    deleted_at: null,
  } as TransactionOut;

  it("marks the detail row deleted on a queued delete and live again on restore", async () => {
    onlineManager.setOnline(false);
    client.setQueryData(["transactions", "detail", "d1"], row);
    const del = client
      .getMutationCache()
      .build(client, { mutationKey: TX_DELETE_KEY });
    void del.execute("d1").catch(() => undefined);
    await flush();
    expect(
      client.getQueryData<TransactionOut>(["transactions", "detail", "d1"])
        ?.deleted_at,
    ).not.toBeNull();
    const restore = client
      .getMutationCache()
      .build(client, { mutationKey: TX_RESTORE_KEY });
    void restore.execute("d1").catch(() => undefined);
    await flush();
    expect(
      client.getQueryData<TransactionOut>(["transactions", "detail", "d1"])
        ?.deleted_at,
    ).toBeNull();
    onlineManager.setOnline(true);
  });
});
