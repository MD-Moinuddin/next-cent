import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/query/errors";
import { categories, me, tx } from "@/test/fixtures";
import {
  appWrapperFor,
  createTestClient,
  disposeClient,
  settle,
  pressAndSettle,
} from "@/test/wrapper";
import { EditTransactionScreen } from "./EditTransactionScreen";
import { registerTransactionMutations } from "./mutations";
import { confirmIdentity } from "@/lib/auth/identity";

jest.mock("@/lib/api", () => ({
  api: {
    getMe: jest.fn(),
    listCategories: jest.fn(),
    listTransactions: jest.fn(),
    getTransaction: jest.fn(),
    putTransaction: jest.fn(),
    deleteTransaction: jest.fn(),
    restoreTransaction: jest.fn(),
  },
  setTokenGetter: jest.fn(),
}));
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));
const mocked = jest.mocked(api);

let client: QueryClient;
beforeEach(() => {
  // Queued writes wait for a confirmed signed-in identity (lib/auth/identity.ts).
  confirmIdentity("test-user");
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  client = createTestClient();
  registerTransactionMutations(client);
  mocked.getMe.mockResolvedValue(me);
  mocked.listCategories.mockResolvedValue(categories);
  mocked.listTransactions.mockResolvedValue({ items: [], next_cursor: null });
  mocked.getTransaction.mockResolvedValue(tx());
  mocked.putTransaction.mockResolvedValue({} as never);
  mocked.deleteTransaction.mockResolvedValue(undefined as never);
  mocked.restoreTransaction.mockResolvedValue({} as never);
});
afterEach(() => disposeClient(client));

const renderEdit = () =>
  render(<EditTransactionScreen id="t1" />, { wrapper: appWrapperFor(client) });

it("prefills from the transaction and saves with base_version", async () => {
  await renderEdit();
  expect(await screen.findByTestId("quick-add-amount")).toHaveTextContent(
    "€32.15",
  );
  expect(screen.getByTestId("quick-add-merchant").props.value).toBe("Lidl");
  await fireEvent.press(screen.getByTestId("key-back"));
  await fireEvent.press(screen.getByTestId("key-0"));
  await pressAndSettle(screen.getByTestId("quick-add-save"));
  await waitFor(() => expect(mocked.putTransaction).toHaveBeenCalledTimes(1));
  expect(mocked.putTransaction).toHaveBeenCalledWith(
    "t1",
    expect.objectContaining({
      amount_minor: 3210,
      base_version: 3,
      merchant: "Lidl",
    }),
  );
  expect(mockBack).toHaveBeenCalled();
  await settle();
});

it("opens instantly from a cached list without waiting for the network", async () => {
  client.setQueryData(["transactions", "list", { limit: 5 }], {
    pages: [{ items: [tx({ merchant: "Cached" })], next_cursor: null }],
    pageParams: [undefined],
  });
  mocked.getTransaction.mockReturnValue(new Promise(() => {}));
  await renderEdit();
  expect(await screen.findByTestId("quick-add-amount")).toHaveTextContent(
    "€32.15",
  );
  expect(screen.getByTestId("quick-add-merchant").props.value).toBe("Cached");
  await settle();
});

const queuedCreate = () =>
  client
    .getMutationCache()
    .build(client, { mutationKey: ["transactions", "put"] })
    .execute({
      id: "t1",
      body: {
        kind: "expense",
        amount_minor: 1,
        currency: "EUR",
        occurred_on: "2026-11-17",
        category_id: null,
        tags: [],
      },
    })
    .catch(() => undefined);

it("rebases an edit of a row with queued writes: replay reads the latest version", async () => {
  client.mount();
  onlineManager.setOnline(false);
  client.setQueryData(["me"], me);
  client.setQueryData(["categories", true], categories);
  client.setQueryData(["transactions", "detail", "t1"], tx({ version: 1 }));
  mocked.getTransaction.mockResolvedValue(tx({ version: 1 })); // what the replay GET sees
  void queuedCreate();
  await renderEdit();
  await screen.findByTestId("quick-add-amount");
  await fireEvent.press(screen.getByTestId("category-chip-dining"));
  await pressAndSettle(screen.getByTestId("quick-add-save"));
  await waitFor(() =>
    expect(client.getMutationCache().getAll()).toHaveLength(2),
  );
  const edit = client.getMutationCache().getAll()[1]!;
  expect(edit.state.variables).toMatchObject({ id: "t1", rebase: true });
  expect(
    (edit.state.variables as { body: { base_version?: number } }).body
      .base_version,
  ).toBeUndefined();
  await act(async () => {
    onlineManager.setOnline(true);
  });
  await waitFor(() => expect(mocked.putTransaction).toHaveBeenCalledTimes(2));
  expect(mocked.putTransaction.mock.calls[0]![1].base_version).toBeUndefined();
  expect(mocked.putTransaction.mock.calls[1]![1].base_version).toBe(1);
  expect(screen.queryByTestId("conflict-message")).toBeNull();
  await settle();
  client.unmount();
});

it("rebases an edit after a pending delete + Undo (restore), which bump the server version", async () => {
  client.mount();
  onlineManager.setOnline(false);
  client.setQueryData(["me"], me);
  client.setQueryData(["categories", true], categories);
  client.setQueryData(["transactions", "detail", "t1"], tx({ version: 3 }));
  mocked.getTransaction.mockResolvedValue(tx({ version: 5 })); // delete 4, restore 5
  await act(async () => {
    const cache = client.getMutationCache();
    void cache
      .build(client, { mutationKey: ["transactions", "delete"] })
      .execute("t1")
      .catch(() => undefined);
    void cache
      .build(client, { mutationKey: ["transactions", "restore"] })
      .execute("t1")
      .catch(() => undefined);
  });
  // while the delete is still running the restore's onMutate has not run yet; mimic its effect
  client.setQueryData(["transactions", "detail", "t1"], tx({ version: 3 }));
  await renderEdit();
  await screen.findByTestId("quick-add-amount");
  await fireEvent.press(screen.getByTestId("category-chip-dining"));
  await pressAndSettle(screen.getByTestId("quick-add-save"));
  const edit = client.getMutationCache().getAll()[2]!;
  expect(edit.state.variables).toMatchObject({ id: "t1", rebase: true });
  expect(
    (edit.state.variables as { body: { base_version?: number } }).body
      .base_version,
  ).toBeUndefined();
  await act(async () => {
    onlineManager.setOnline(true);
  });
  await waitFor(() => expect(mocked.putTransaction).toHaveBeenCalledTimes(1));
  expect(mocked.putTransaction.mock.calls[0]![1].base_version).toBe(5);
  expect(screen.queryByTestId("conflict-message")).toBeNull();
  await settle();
  client.unmount();
});

it("a rejected rebased edit is not reported as 'changed on another device'", async () => {
  client.mount();
  onlineManager.setOnline(false);
  client.setQueryData(["me"], me);
  client.setQueryData(["categories", true], categories);
  client.setQueryData(["transactions", "detail", "t1"], tx({ version: 1 }));
  mocked.getTransaction.mockResolvedValue(tx({ version: 1 }));
  mocked.putTransaction
    .mockResolvedValueOnce({} as never)
    .mockRejectedValue(new ApiError(409, { code: "version_conflict" }));
  void queuedCreate();
  await renderEdit();
  await screen.findByTestId("quick-add-amount");
  await fireEvent.press(screen.getByTestId("category-chip-dining"));
  await pressAndSettle(screen.getByTestId("quick-add-save"));
  await waitFor(() =>
    expect(client.getMutationCache().getAll()).toHaveLength(2),
  );
  await act(async () => {
    onlineManager.setOnline(true);
  });
  await waitFor(() =>
    expect(
      client
        .getMutationCache()
        .getAll()
        .some((m) => m.state.status === "error"),
    ).toBe(true),
  );
  await settle();
  expect(screen.queryByTestId("conflict-message")).toBeNull();
  client.unmount();
});

it("a synced row is saved with base_version = tx.version and no rebase", async () => {
  await renderEdit();
  await screen.findByTestId("quick-add-amount");
  const gets = mocked.getTransaction.mock.calls.length;
  await fireEvent.press(screen.getByTestId("key-back"));
  await pressAndSettle(screen.getByTestId("quick-add-save"));
  await waitFor(() => expect(mocked.putTransaction).toHaveBeenCalledTimes(1));
  expect(mocked.putTransaction.mock.calls[0]![1].base_version).toBe(3);
  const vars = client.getMutationCache().getAll()[0]!.state.variables as Record<
    string,
    unknown
  >;
  expect(vars.rebase).toBeUndefined();
  // no replay GET before the PUT (a later GET is the post-save refetch)
  for (const order of mocked.getTransaction.mock.invocationCallOrder.slice(
    gets,
  ))
    expect(order).toBeGreaterThan(
      mocked.putTransaction.mock.invocationCallOrder[0]!,
    );
  await settle();
});

it("only reports a conflict for a non-rebase put; a stale version shows the message", async () => {
  mocked.getTransaction
    .mockResolvedValueOnce(tx({ version: 2 }))
    .mockResolvedValue(tx({ version: 9, amount_minor: 100 }));
  mocked.putTransaction.mockRejectedValue(
    new ApiError(409, { code: "version_conflict", current_version: 9 }),
  );
  await renderEdit();
  await screen.findByTestId("quick-add-amount");
  await pressAndSettle(screen.getByTestId("quick-add-save"));
  expect(await screen.findByTestId("conflict-message")).toHaveTextContent(
    "Changed on another device. Review and save again",
  );
  expect(mocked.putTransaction.mock.calls[0]![1].base_version).toBe(2);
  await settle();
});

it("treats a row that is not an expense or income as not found", async () => {
  mocked.getTransaction.mockResolvedValue(tx({ kind: "opening_balance" }));
  await renderEdit();
  expect(
    await screen.findByText("We could not load this transaction."),
  ).toBeOnTheScreen();
  expect(screen.queryByTestId("quick-add-save")).toBeNull();
  await settle();
});

it("shows an error with Retry when the profile cannot be loaded", async () => {
  mocked.getMe.mockRejectedValueOnce(new ApiError(500));
  await renderEdit();
  expect(
    await screen.findByText("We could not load your data."),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByTestId("quick-add-amount")).toBeOnTheScreen();
  await settle();
});

it("deletes, goes back and offers Undo that restores the same id", async () => {
  await renderEdit();
  await fireEvent.press(await screen.findByTestId("transaction-delete"));
  await waitFor(() =>
    expect(mocked.deleteTransaction).toHaveBeenCalledWith("t1"),
  );
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("Transaction deleted")).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId("toast-action"));
  await waitFor(() =>
    expect(mocked.restoreTransaction).toHaveBeenCalledWith("t1"),
  );
  await settle();
});

it("shows the deleted state for a stale link and Restore brings the form back", async () => {
  mocked.getTransaction
    .mockResolvedValueOnce(tx({ deleted_at: "2026-11-18T00:00:00Z" }))
    .mockResolvedValue(tx()); // after the restore the server returns the live row
  await renderEdit();
  expect(
    await screen.findByText("This transaction was deleted"),
  ).toBeOnTheScreen();
  expect(screen.queryByTestId("quick-add-save")).toBeNull();
  await fireEvent.press(screen.getByTestId("transaction-restore"));
  await waitFor(() =>
    expect(mocked.restoreTransaction).toHaveBeenCalledWith("t1"),
  );
  expect(await screen.findByTestId("quick-add-save")).toBeOnTheScreen();
  await settle();
});

it("shows an error with Retry when the transaction cannot be loaded", async () => {
  mocked.getTransaction.mockRejectedValueOnce(
    new ApiError(404, { code: "not_found" }),
  );
  await renderEdit();
  expect(
    await screen.findByText("We could not load this transaction."),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByTestId("quick-add-amount")).toBeOnTheScreen();
  await settle();
});

it("shows the 'changed elsewhere' message after the refetch on a version conflict", async () => {
  mocked.getTransaction
    .mockResolvedValueOnce(tx({ version: 3 }))
    .mockResolvedValue(tx({ version: 4, amount_minor: 5000 }));
  mocked.putTransaction.mockRejectedValue(
    new ApiError(409, { code: "version_conflict", current_version: 4 }),
  );
  await renderEdit();
  await screen.findByTestId("quick-add-amount");
  expect(screen.queryByTestId("conflict-message")).toBeNull();
  await pressAndSettle(screen.getByTestId("quick-add-save"));
  const message = await screen.findByTestId("conflict-message");
  expect(message).toHaveTextContent(
    "Changed on another device. Review and save again",
  );
  // the form now holds the server's newer version
  await waitFor(() =>
    expect(screen.getByTestId("quick-add-amount")).toHaveTextContent("€50.00"),
  );
  expect(mocked.getTransaction.mock.calls.length).toBeGreaterThanOrEqual(2);
  await settle();
});
