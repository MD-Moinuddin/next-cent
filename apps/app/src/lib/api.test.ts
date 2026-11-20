import { api, getAuthToken, setTokenGetter } from "./api";
import { ApiError, NetworkError } from "./query/errors";

const json = (
  status: number,
  body: unknown,
  contentType = "application/json",
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": contentType },
  });

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  setTokenGetter(async () => "tok");
});
afterEach(() => setTokenGetter(null));

it("sends the bearer token and returns parsed data", async () => {
  fetchMock.mockResolvedValue(json(200, { id: "u1" }));
  await expect(api.getMe()).resolves.toEqual({ id: "u1" });
  const req = fetchMock.mock.calls[0]![0] as Request;
  expect(req.url).toBe("http://localhost:8000/v1/me");
  expect(req.headers.get("Authorization")).toBe("Bearer tok");
});

it("maps path and body for putTransaction", async () => {
  fetchMock.mockResolvedValue(json(200, { id: "t1" }));
  const body = {
    kind: "expense" as const,
    amount_minor: 5,
    currency: "EUR",
    occurred_on: "2026-11-02",
  };
  await api.putTransaction("t1", body);
  const req = fetchMock.mock.calls[0]![0] as Request;
  expect(req.method).toBe("PUT");
  expect(new URL(req.url).pathname).toBe("/v1/transactions/t1");
  expect(await req.json()).toEqual(body);
});

it("maps problem+json errors to ApiError with the stable code", async () => {
  fetchMock.mockResolvedValue(
    json(
      409,
      { code: "version_conflict", title: "Conflict", current_version: 3 },
      "application/problem+json",
    ),
  );
  const err = await api.getTransaction("t1").catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ status: 409, code: "version_conflict" });
});

it("maps a fetch failure to NetworkError", async () => {
  fetchMock.mockRejectedValue(new TypeError("Network request failed"));
  await expect(api.getMe()).rejects.toBeInstanceOf(NetworkError);
});

it("exposes the current auth token for raw requests", async () => {
  setTokenGetter(async () => "tok2");
  await expect(getAuthToken()).resolves.toBe("tok2");
  setTokenGetter(null);
  await expect(getAuthToken()).resolves.toBeNull();
});
