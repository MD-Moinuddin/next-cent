import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { setTokenGetter } from "@/lib/api";
import {
  confirmIdentity,
  IdentityChangedError,
  resetIdentity,
} from "@/lib/auth/identity";
import { ApiError } from "@/lib/query/errors";
import { createQueryClient } from "@/lib/query/queryClient";
import { registerTransactionMutations, TX_PUT_KEY } from "./mutations";

// Real API adapter and generated client; only the network (fetch) and the session token are faked.
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type":
        status >= 400 ? "application/problem+json" : "application/json",
    },
  });
const unauthorized = () =>
  json(401, { code: "invalid_token", title: "Invalid or expired token" });

const body = {
  kind: "expense" as const,
  amount_minor: 250,
  currency: "EUR",
  occurred_on: "2026-11-02",
  category_id: null,
  tags: [],
};

let client: QueryClient;
let fetchMock: jest.Mock;
let tokenCalls = 0;
const flush = () => new Promise<void>((r) => setImmediate(r));
const authHeaders = () =>
  fetchMock.mock.calls.map(([req]) =>
    (req as Request).headers.get("Authorization"),
  );

beforeEach(() => {
  resetIdentity();
  onlineManager.setOnline(true);
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  tokenCalls = 0;
  // Each call returns a new token, like a session that refreshes its JWT.
  setTokenGetter(async () => `tok-${++tokenCalls}`);
  client = createQueryClient();
  registerTransactionMutations(client);
});
afterEach(() => {
  setTokenGetter(null);
  client
    .getMutationCache()
    .getAll()
    .forEach((m) => m.destroy());
  client.clear();
  resetIdentity();
});

const run = (vars: unknown) => {
  const m = client
    .getMutationCache()
    .build(client, { mutationKey: TX_PUT_KEY });
  return { m, done: m.execute(vars) };
};

describe("identity gate", () => {
  it("waits for a confirmed identity before calling the API", async () => {
    fetchMock.mockResolvedValue(json(201, { id: "t1" }));
    const { done } = run({ id: "t1", body });
    for (let i = 0; i < 5; i++) await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    confirmIdentity("user-a");
    await expect(done).resolves.toEqual({ id: "t1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("abandons a waiting write when the identity is reset, even if someone signs in later", async () => {
    fetchMock.mockResolvedValue(json(201, { id: "t1" }));
    const { done } = run({ id: "t1", body });
    await flush();
    resetIdentity(); // sign-out or a different user (clearLocalData)
    await expect(done).rejects.toBeInstanceOf(IdentityChangedError);
    confirmIdentity("user-b");
    for (let i = 0; i < 5; i++) await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("401 on a queued write", () => {
  beforeEach(() => confirmIdentity("user-a"));

  it("retries with a fresh token and succeeds", async () => {
    jest.useFakeTimers();
    try {
      fetchMock
        .mockResolvedValueOnce(unauthorized())
        .mockResolvedValueOnce(json(201, { id: "t1" }));
      const { done } = run({ id: "t1", body });
      await jest.advanceTimersByTimeAsync(5_000);
      await expect(done).resolves.toEqual({ id: "t1" });
      expect(authHeaders()).toEqual(["Bearer tok-1", "Bearer tok-2"]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps the write as a visible failed mutation after 3 attempts (not discarded)", async () => {
    jest.useFakeTimers();
    try {
      fetchMock.mockImplementation(async () => unauthorized());
      const { m, done } = run({ id: "t1", body });
      const settled = done.catch((e: unknown) => e);
      await jest.advanceTimersByTimeAsync(30_000);
      const error = await settled;
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(401);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(new Set(authHeaders()).size).toBe(3); // a fresh token for every attempt
      expect(m.state.status).toBe("error");
      expect(client.getMutationCache().getAll()).toContain(m);
      expect(m.state.variables).toEqual({ id: "t1", body });
    } finally {
      jest.useRealTimers();
    }
  });
});
