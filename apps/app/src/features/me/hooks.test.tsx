import { renderHook, act } from "@testing-library/react-native";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query/queryClient";
import { me } from "@/test/fixtures";
import { createTestClient, disposeClient, wrapperFor } from "@/test/wrapper";
import { usePatchMe } from "./hooks";

jest.mock("@/lib/api", () => ({ api: { patchMe: jest.fn() } }));

it("refreshes summaries and the recurring rules after a profile change", async () => {
  const client = createTestClient();
  jest.mocked(api.patchMe).mockResolvedValue(me);
  client.setQueryData(queryKeys.recurring, []);
  client.setQueryData(queryKeys.summary("a", "b"), {});
  const { result } = await renderHook(() => usePatchMe(), {
    wrapper: wrapperFor(client),
  });
  await act(async () => {
    await result.current.mutateAsync({ monthly_income_minor: 1 });
  });
  expect(client.getQueryState(queryKeys.recurring)?.isInvalidated).toBe(true);
  expect(client.getQueryState(queryKeys.summary("a", "b"))?.isInvalidated).toBe(
    true,
  );
  expect(client.getQueryData(queryKeys.me)).toEqual(me);
  disposeClient(client);
});
