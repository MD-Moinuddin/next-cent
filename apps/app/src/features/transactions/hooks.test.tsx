import { renderHook, waitFor } from "@testing-library/react-native";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { tx } from "@/test/fixtures";
import { createTestClient, disposeClient, wrapperFor } from "@/test/wrapper";
import { useTransaction } from "./hooks";

jest.mock("@/lib/api", () => ({
  api: { getTransaction: jest.fn(), listTransactions: jest.fn() },
}));
const mocked = jest.mocked(api);

let client: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  client = createTestClient();
  client.setQueryDefaults(["transactions"], { staleTime: 30_000 });
});
afterEach(() => disposeClient(client));

it("seeds a transaction from a cached list without a request", async () => {
  client.setQueryData(["transactions", "list", { limit: 5 }], {
    pages: [
      { items: [tx({ id: "x1", merchant: "Cached" })], next_cursor: null },
    ],
    pageParams: [undefined],
  });
  const { result } = await renderHook(() => useTransaction("x1"), {
    wrapper: wrapperFor(client),
  });
  expect(result.current.data?.merchant).toBe("Cached");
  expect(mocked.getTransaction).not.toHaveBeenCalled();
});

it("fetches when it is not in any cached list", async () => {
  mocked.getTransaction.mockResolvedValue(tx({ id: "y1" }));
  const { result } = await renderHook(() => useTransaction("y1"), {
    wrapper: wrapperFor(client),
  });
  await waitFor(() => expect(result.current.data?.id).toBe("y1"));
  expect(mocked.getTransaction).toHaveBeenCalledWith("y1");
});
