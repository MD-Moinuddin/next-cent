import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import {
  registerTransactionMutations,
  TX_PUT_KEY,
} from "@/features/transactions/mutations";
import { api } from "@/lib/api";
import { NetworkError } from "@/lib/query/errors";
import { confirmIdentity, resetIdentity } from "@/lib/auth/identity";
import { SessionContext, type SessionApi } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/queryClient";
import { me } from "@/test/fixtures";
import {
  appWrapperFor,
  createTestClient,
  disposeClient,
  pressAndSettle,
  settle,
} from "@/test/wrapper";
import { confirmDestructive } from "./confirm";
import { SettingsScreen } from "./SettingsScreen";

// Real mutation queue and real clearing helpers: a queued write must not replay after DELETE /v1/me
// (it would re-provision a fresh profile through the API's get-or-create).
jest.mock("@/lib/api", () => ({
  api: {
    getMe: jest.fn(),
    deleteMe: jest.fn(),
    putTransaction: jest.fn(),
    deleteTransaction: jest.fn(),
    restoreTransaction: jest.fn(),
  },
  setTokenGetter: jest.fn(),
  getAuthToken: jest.fn(),
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock("./confirm", () => ({ confirmDestructive: jest.fn() }));
const mocked = jest.mocked(api);

let client: QueryClient;
const session: SessionApi = {
  isLoaded: true,
  isSignedIn: true,
  userId: "u1",
  getToken: jest.fn(),
  signOut: jest.fn(async () => {}),
  deleteAuthAccount: jest.fn(async () => {}),
};
function wrapper({ children }: { children: ReactNode }) {
  const Inner = appWrapperFor(client);
  return (
    <SessionContext.Provider value={session}>
      <Inner>{children}</Inner>
    </SessionContext.Provider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  client = createTestClient();
  registerTransactionMutations(client);
  confirmIdentity("u1");
  jest.mocked(confirmDestructive).mockResolvedValue(true);
});
afterEach(() => {
  onlineManager.setOnline(true);
  disposeClient(client);
  resetIdentity();
});

it("discards a queued write before DELETE /v1/me, and it never replays afterwards", async () => {
  // Deletion needs a connection, so the queued write here is one waiting at the identity gate
  // (for example restored at start-up and not yet confirmed), not one paused offline.
  resetIdentity();
  const order: string[] = [];
  mocked.putTransaction.mockImplementation(async () => {
    order.push("put");
    return { id: "t1" } as never;
  });
  mocked.deleteMe.mockImplementation(async () => {
    order.push(
      `deleteMe (queued: ${client.getMutationCache().getAll().length})`,
    );
    return undefined as never;
  });
  client.setQueryData(queryKeys.me, me);
  void client
    .getMutationCache()
    .build(client, { mutationKey: TX_PUT_KEY })
    .execute({
      id: "t1",
      body: {
        kind: "expense",
        amount_minor: 990,
        currency: "EUR",
        occurred_on: "2026-11-02",
        category_id: "c1",
        tags: [],
      },
    })
    .catch(() => undefined);
  await settle();
  expect(client.getMutationCache().getAll()).toHaveLength(1);

  await render(<SettingsScreen />, { wrapper });
  await pressAndSettle(screen.getByTestId("settings-delete-account"));
  confirmIdentity("u1"); // the gate opens after the deletion: the discarded write must stay gone
  await client.resumePausedMutations();
  await settle();

  expect(order).toEqual(["deleteMe (queued: 0)"]);
  expect(mocked.putTransaction).not.toHaveBeenCalled();
  expect(session.deleteAuthAccount).toHaveBeenCalledTimes(1);
});

it("also stops a write that is backing off between retries", async () => {
  const order: string[] = [];
  mocked.putTransaction.mockImplementation(async () => {
    order.push("put");
    throw new NetworkError(new Error("flaky"));
  });
  mocked.deleteMe.mockImplementation(async () => {
    order.push("deleteMe");
    return undefined as never;
  });
  client.setQueryData(queryKeys.me, me);
  void client
    .getMutationCache()
    .build(client, { mutationKey: TX_PUT_KEY })
    .execute({
      id: "t2",
      body: {
        kind: "income",
        amount_minor: 100,
        currency: "EUR",
        occurred_on: "2026-11-02",
        tags: [],
      },
    })
    .catch(() => undefined);
  await settle();
  expect(order).toEqual(["put"]); // failed once, next retry in about a second

  await render(<SettingsScreen />, { wrapper });
  await pressAndSettle(screen.getByTestId("settings-delete-account"));
  await new Promise((r) => setTimeout(r, 1_500)); // past the retry delay
  await settle();

  expect(order).toEqual(["put", "deleteMe"]);
});
