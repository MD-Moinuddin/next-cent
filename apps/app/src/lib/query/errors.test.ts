import { ApiError, NetworkError, isRetryable, unwrap } from "./errors";

const res = (status: number) =>
  ({ ok: status >= 200 && status < 300, status }) as Response;

it("retries network failures, 5xx, 429 and 408 only", () => {
  expect(isRetryable(new NetworkError(new Error("down")))).toBe(true);
  for (const s of [500, 502, 503, 429, 408])
    expect(isRetryable(new ApiError(s))).toBe(true);
  for (const s of [400, 401, 404, 409, 422])
    expect(isRetryable(new ApiError(s))).toBe(false);
  expect(isRetryable(new Error("other"))).toBe(false);
});

describe("unwrap", () => {
  it("returns data on success", async () => {
    await expect(
      unwrap(Promise.resolve({ data: { a: 1 }, response: res(200) })),
    ).resolves.toEqual({ a: 1 });
  });

  it("returns undefined data for an empty 204", async () => {
    await expect(
      unwrap(Promise.resolve({ data: undefined, response: res(204) })),
    ).resolves.toBeUndefined();
  });

  it("throws ApiError carrying status, code and problem", async () => {
    const problem = {
      code: "version_conflict",
      title: "Conflict",
      current_version: 4,
    };
    const err = await unwrap(
      Promise.resolve({ error: problem, response: res(409) }),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 409,
      code: "version_conflict",
      message: "Conflict",
    });
    expect((err as ApiError).problem?.current_version).toBe(4);
  });

  it("throws ApiError when the response is not ok even without an error body", async () => {
    await expect(
      unwrap(Promise.resolve({ response: res(500) })),
    ).rejects.toMatchObject({ status: 500 });
  });

  it("wraps a rejected call (fetch failure) in NetworkError", async () => {
    const err = await unwrap(
      Promise.reject(new TypeError("Network request failed")),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(isRetryable(err)).toBe(true);
  });

  it("does not treat a non-object error body as a problem", async () => {
    const err = await unwrap(
      Promise.resolve({ error: "boom", response: res(400) }),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBeUndefined();
  });
});
