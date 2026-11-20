import { act, renderHook } from "@testing-library/react-native";
import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { createTestClient, disposeClient, wrapperFor } from "@/test/wrapper";
import {
  TX_DELETE_KEY,
  TX_RESTORE_KEY,
  usePendingDeletes,
  usePendingRestores,
} from "./pending";
import { confirmIdentity } from "@/lib/auth/identity";

let client: QueryClient;
beforeEach(() => {
  // Queued writes wait for a confirmed signed-in identity (lib/auth/identity.ts).
  confirmIdentity("test-user");
  client = createTestClient();
  onlineManager.setOnline(false);
});
afterEach(() => {
  onlineManager.setOnline(true);
  disposeClient(client);
});

const queue = (key: readonly string[], id: string) =>
  client
    .getMutationCache()
    .build(client, { mutationKey: key, mutationFn: async () => undefined })
    .execute(id)
    .catch(() => undefined);

it("usePendingRestores lists ids of pending restores only", async () => {
  const restores = await renderHook(() => usePendingRestores(), {
    wrapper: wrapperFor(client),
  });
  const deletes = await renderHook(() => usePendingDeletes(), {
    wrapper: wrapperFor(client),
  });
  expect([...restores.result.current]).toEqual([]);
  await act(async () => {
    void queue(TX_RESTORE_KEY, "r1");
    void queue(TX_DELETE_KEY, "d1");
  });
  expect([...restores.result.current]).toEqual(["r1"]);
  expect([...deletes.result.current]).toEqual(["d1"]);
});
