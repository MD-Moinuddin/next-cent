import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "./index";

describe("generated client", () => {
  it("exposes one function per operation id", () => {
    for (const name of [
      "getMe",
      "patchMe",
      "deleteMe",
      "listCategories",
      "createCategory",
      "patchCategory",
      "putTransaction",
      "deleteTransaction",
      "restoreTransaction",
      "getTransaction",
      "listTransactions",
      "listTransactionChanges",
      "listTags",
      "listRecurring",
      "createRecurring",
      "patchRecurring",
      "getSummary",
      "exportCsv",
    ]) {
      expect(typeof (api as Record<string, unknown>)[name], name).toBe(
        "function",
      );
    }
  });
  it("exports configureApiClient", () => {
    expect(typeof api.configureApiClient).toBe("function");
  });
});

describe("configureApiClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch() {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("sends the bearer token and omits it when the token is null", async () => {
    const fetchMock = stubFetch();
    let token: string | null = "abc123";
    api.configureApiClient({
      baseUrl: "https://api.test",
      getToken: async () => token,
    });

    await api.getMe();
    const first = (fetchMock.mock.calls as unknown as [Request][])[0]![0];
    expect(first.url).toBe("https://api.test/v1/me");
    expect(first.headers.get("Authorization")).toBe("Bearer abc123");

    token = null;
    await api.getMe();
    const second = (fetchMock.mock.calls as unknown as [Request][])[1]![0];
    expect(second.headers.has("Authorization")).toBe(false);
  });

  it("does not stack interceptors when called twice", async () => {
    const fetchMock = stubFetch();
    api.configureApiClient({
      baseUrl: "https://api.test",
      getToken: async () => "one",
    });
    api.configureApiClient({
      baseUrl: "https://api.test",
      getToken: async () => "two",
    });
    await api.getMe();
    expect(
      (fetchMock.mock.calls as unknown as [Request][])[0]![0].headers.get(
        "Authorization",
      ),
    ).toBe("Bearer two");
  });
});
