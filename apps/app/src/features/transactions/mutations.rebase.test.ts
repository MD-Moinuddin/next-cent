import {
  dehydrate,
  hydrate,
  onlineManager,
  type QueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ApiError, NetworkError } from "@/lib/query/errors";
import { createQueryClient } from "@/lib/query/queryClient";
import type { TransactionIn, TransactionOut } from "@/lib/types";
import {
  TX_DELETE_KEY,
  TX_PUT_KEY,
  TX_RESTORE_KEY,
  registerTransactionMutations,
} from "./mutations";
import type { PutVars } from "./optimistic";
import { confirmIdentity } from "@/lib/auth/identity";

jest.mock("@/lib/api", () => ({
  api: {
    putTransaction: jest.fn(),
    getTransaction: jest.fn(),
    deleteTransaction: jest.fn(),
    restoreTransaction: jest.fn(),
  },
  setTokenGetter: jest.fn(),
}));
const mocked = api as unknown as Record<
  | "putTransaction"
  | "getTransaction"
  | "deleteTransaction"
  | "restoreTransaction",
  jest.Mock
>;

const body = (amount: number, extra: Partial<TransactionIn> = {}) => ({
  kind: "expense" as const,
  amount_minor: amount,
  currency: "EUR",
  occurred_on: "2026-11-02",
  category_id: null,
  tags: [],
  ...extra,
});

/** A fake server enforcing the real contract (services/transactions.py). */
function fakeServer(seed?: Record<string, number>) {
  const rows = new Map<string, { version: number; content: string }>();
  for (const [id, version] of Object.entries(seed ?? {}))
    rows.set(id, { version, content: "seed" });
  const content = (b: TransactionIn) =>
    JSON.stringify({ ...b, base_version: undefined });
  const row = (id: string, version: number) =>
    ({ id, version, deleted_at: null }) as TransactionOut;
  mocked.getTransaction.mockImplementation(async (id: string) => {
    const r = rows.get(id);
    if (!r) throw new ApiError(404, { code: "not_found" });
    return row(id, r.version);
  });
  mocked.putTransaction.mockImplementation(
    async (id: string, b: TransactionIn) => {
      const r = rows.get(id);
      if (!r) {
        if (b.base_version != null)
          throw new ApiError(404, { code: "not_found" });
        rows.set(id, { version: 1, content: content(b) });
        return row(id, 1);
      }
      if (r.content === content(b)) return row(id, r.version); // idempotent
      if (b.base_version !== r.version)
        throw new ApiError(409, {
          code: "version_conflict",
          current_version: r.version,
        });
      rows.set(id, { version: r.version + 1, content: content(b) });
      return row(id, r.version + 1);
    },
  );
  mocked.deleteTransaction.mockImplementation(async (id: string) => {
    const r = rows.get(id)!;
    rows.set(id, { ...r, version: r.version + 1 });
  });
  mocked.restoreTransaction.mockImplementation(async (id: string) => {
    const r = rows.get(id)!;
    rows.set(id, { ...r, version: r.version + 1 });
    return row(id, r.version + 1);
  });
  return rows;
}

const flush = () => new Promise<void>((r) => setImmediate(r));
let client: QueryClient;
const dispose = (c: QueryClient) => {
  c.getMutationCache()
    .getAll()
    .forEach((m) => m.destroy());
  c.clear();
};
const run = (vars: PutVars) =>
  client
    .getMutationCache()
    .build(client, { mutationKey: TX_PUT_KEY })
    .execute(vars);
const errored = () =>
  client
    .getMutationCache()
    .getAll()
    .filter((m) => m.state.status === "error");

beforeEach(() => {
  // Queued writes wait for a confirmed signed-in identity (lib/auth/identity.ts).
  confirmIdentity("test-user");
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  client = createQueryClient();
  registerTransactionMutations(client);
  client.mount(); // resume paused mutations when the app comes back online
});
afterEach(() => {
  client.unmount();
  dispose(client);
  onlineManager.setOnline(true);
});

it("the fake server rejects a different-content edit without a version (proves the old behaviour failed)", async () => {
  fakeServer({ a: 1 });
  await expect(run({ id: "a", body: body(900) })).rejects.toMatchObject({
    status: 409,
  });
});

it("offline create then offline rebased edit: PUT, GET, PUT with the latest version", async () => {
  const rows = fakeServer();
  onlineManager.setOnline(false);
  const p1 = run({ id: "a", body: body(500) });
  const p2 = run({ id: "a", body: body(800), rebase: true });
  await flush();
  expect(mocked.putTransaction).not.toHaveBeenCalled();
  onlineManager.setOnline(true);
  await Promise.all([p1, p2]);
  expect(mocked.putTransaction).toHaveBeenCalledTimes(2);
  expect(mocked.putTransaction.mock.calls[0]![1].base_version).toBeUndefined();
  expect(mocked.getTransaction).toHaveBeenCalledWith("a");
  expect(mocked.putTransaction.mock.calls[1]![1]).toMatchObject({
    amount_minor: 800,
    base_version: 1,
  });
  expect(rows.get("a")!.version).toBe(2);
  // order: create PUT, then the GET, then the edit PUT
  expect(mocked.putTransaction.mock.invocationCallOrder[0]).toBeLessThan(
    mocked.getTransaction.mock.invocationCallOrder[0]!,
  );
  expect(mocked.getTransaction.mock.invocationCallOrder[0]).toBeLessThan(
    mocked.putTransaction.mock.invocationCallOrder[1]!,
  );
  expect(errored()).toHaveLength(0);
});

it("the request body never carries the rebase flag", async () => {
  fakeServer({ a: 2 });
  await run({ id: "a", body: body(900), rebase: true });
  expect(mocked.putTransaction.mock.calls[0]![1]).not.toHaveProperty("rebase");
});

it("two edits in a row while the first is in flight", async () => {
  const rows = fakeServer({ a: 3 });
  onlineManager.setOnline(false);
  const p1 = run({ id: "a", body: body(600, { base_version: 3 }) });
  const p2 = run({ id: "a", body: body(700), rebase: true });
  const p3 = run({ id: "a", body: body(800), rebase: true });
  await flush();
  onlineManager.setOnline(true);
  await Promise.all([p1, p2, p3]);
  expect(
    mocked.putTransaction.mock.calls.map((c) => c[1].base_version),
  ).toEqual([3, 4, 5]);
  expect(rows.get("a")!.version).toBe(6);
  expect(errored()).toHaveLength(0);
});

it("sends a create (no version) when the row does not exist on the server", async () => {
  const rows = fakeServer();
  await run({ id: "ghost", body: body(400), rebase: true });
  expect(mocked.putTransaction.mock.calls[0]![1].base_version).toBeUndefined();
  expect(rows.get("ghost")!.version).toBe(1);
});

it("retries a network error from the GET", async () => {
  jest.useFakeTimers();
  try {
    fakeServer({ a: 2 });
    const real = mocked.getTransaction.getMockImplementation()!;
    mocked.getTransaction
      .mockRejectedValueOnce(new NetworkError(new Error("down")))
      .mockImplementation(real);
    const p = run({ id: "a", body: body(900), rebase: true });
    await jest.advanceTimersByTimeAsync(5_000);
    await expect(p).resolves.toBeDefined();
    expect(mocked.getTransaction).toHaveBeenCalledTimes(2);
    expect(mocked.putTransaction.mock.calls[0]![1].base_version).toBe(2);
  } finally {
    jest.useRealTimers();
  }
});

it("a non-rebase edit with a stale version is a genuine 409", async () => {
  fakeServer({ a: 5 });
  await expect(
    run({ id: "a", body: body(900, { base_version: 3 }) }),
  ).rejects.toMatchObject({ status: 409 });
  expect(mocked.getTransaction).not.toHaveBeenCalled();
});

it("the rebase flag survives a persist/hydrate round trip", async () => {
  fakeServer({ a: 2 });
  onlineManager.setOnline(false);
  void run({ id: "a", body: body(950), rebase: true }).catch(() => undefined);
  await flush();
  const snapshot = JSON.parse(JSON.stringify(dehydrate(client)));
  expect(snapshot.mutations[0].state.variables.rebase).toBe(true);
  const restarted = createQueryClient();
  registerTransactionMutations(restarted);
  hydrate(restarted, snapshot);
  onlineManager.setOnline(true);
  await restarted.resumePausedMutations();
  expect(mocked.getTransaction).toHaveBeenCalledWith("a");
  expect(mocked.putTransaction.mock.calls[0]![1].base_version).toBe(2);
  dispose(restarted);
});

describe("rebase retry loop", () => {
  const conflict = () =>
    new ApiError(409, { code: "version_conflict", current_version: 99 });
  const calls = () =>
    [
      ...mocked.getTransaction.mock.invocationCallOrder.map(
        (o) => [o, "GET"] as const,
      ),
      ...mocked.putTransaction.mock.invocationCallOrder.map(
        (o) => [o, "PUT"] as const,
      ),
    ]
      .sort((a, b) => a[0] - b[0])
      .map((c) => c[1]);

  it("a conflict between GET and PUT is retried with the new version (GET,PUT,GET,PUT)", async () => {
    const rows = fakeServer({ a: 2 });
    const real = mocked.putTransaction.getMockImplementation()!;
    mocked.putTransaction.mockImplementationOnce(async () => {
      rows.get("a")!.version = 3; // another device edited in between
      throw conflict();
    });
    mocked.putTransaction.mockImplementation(real);
    await run({ id: "a", body: body(900), rebase: true });
    expect(calls()).toEqual(["GET", "PUT", "GET", "PUT"]);
    expect(
      mocked.putTransaction.mock.calls.map((c) => c[1].base_version),
    ).toEqual([2, 3]);
    expect(rows.get("a")!.version).toBe(4);
  });

  it("three consecutive conflicts fail after exactly 3 attempts", async () => {
    fakeServer({ a: 2 });
    mocked.putTransaction.mockRejectedValue(conflict());
    await expect(
      run({ id: "a", body: body(900), rebase: true }),
    ).rejects.toMatchObject({ status: 409, code: "version_conflict" });
    expect(mocked.putTransaction).toHaveBeenCalledTimes(3);
    expect(mocked.getTransaction).toHaveBeenCalledTimes(3);
  });

  it("a 422 fails immediately without another GET", async () => {
    fakeServer({ a: 2 });
    mocked.putTransaction.mockRejectedValue(
      new ApiError(422, { code: "invalid_amount" }),
    );
    await expect(
      run({ id: "a", body: body(900), rebase: true }),
    ).rejects.toMatchObject({ status: 422 });
    expect(calls()).toEqual(["GET", "PUT"]);
  });

  it("a network error on the PUT propagates to the retryable path", async () => {
    jest.useFakeTimers();
    try {
      fakeServer({ a: 2 });
      const real = mocked.putTransaction.getMockImplementation()!;
      mocked.putTransaction
        .mockRejectedValueOnce(new NetworkError(new Error("down")))
        .mockImplementation(real);
      const p = run({ id: "a", body: body(900), rebase: true });
      await jest.advanceTimersByTimeAsync(5_000);
      await expect(p).resolves.toBeDefined();
      // the loop did not swallow it: the mutation retry re-ran GET and PUT
      expect(calls()).toEqual(["GET", "PUT", "GET", "PUT"]);
    } finally {
      jest.useRealTimers();
    }
  });
});

it("delete then Undo (restore) then a rebased edit replays against a server that bumps versions", async () => {
  const rows = fakeServer({ a: 3 });
  onlineManager.setOnline(false);
  const mk = (key: readonly string[], vars: unknown) =>
    client.getMutationCache().build(client, { mutationKey: key }).execute(vars);
  const p1 = mk(TX_DELETE_KEY, "a");
  const p2 = mk(TX_RESTORE_KEY, "a");
  const p3 = run({ id: "a", body: body(900), rebase: true });
  await flush();
  onlineManager.setOnline(true);
  await Promise.all([p1, p2, p3]);
  expect(rows.get("a")!.version).toBe(6); // delete 4, restore 5, edit 6
  expect(mocked.putTransaction.mock.calls[0]![1].base_version).toBe(5);
  expect(errored()).toHaveLength(0);
});
