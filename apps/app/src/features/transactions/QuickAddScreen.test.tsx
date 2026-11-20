import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { categories, CAT, me } from "@/test/fixtures";
import {
  appWrapperFor,
  createTestClient,
  disposeClient,
  settle,
  pressAndSettle,
} from "@/test/wrapper";
import { registerTransactionMutations } from "./mutations";
import { QuickAddScreen } from "./QuickAddScreen";
import { confirmIdentity } from "@/lib/auth/identity";

jest.mock("@/lib/api", () => ({
  api: {
    getMe: jest.fn(),
    listCategories: jest.fn(),
    listTransactions: jest.fn(),
    putTransaction: jest.fn(),
    deleteTransaction: jest.fn(),
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
  mocked.putTransaction.mockResolvedValue({} as never);
  mocked.deleteTransaction.mockResolvedValue(undefined as never);
});
afterEach(() => disposeClient(client));

async function addExpense() {
  await render(<QuickAddScreen />, { wrapper: appWrapperFor(client) });
  await fireEvent.press(await screen.findByTestId("key-1"));
  await fireEvent.press(screen.getByTestId("key-4"));
  await fireEvent.press(screen.getByTestId("key-dot"));
  await fireEvent.press(screen.getByTestId("key-5"));
  await fireEvent.press(await screen.findByTestId("category-chip-dining"));
  await pressAndSettle(screen.getByTestId("quick-add-save"));
}

it("opens with the keypad ready", async () => {
  await render(<QuickAddScreen />, { wrapper: appWrapperFor(client) });
  expect(await screen.findByTestId("key-1")).toBeOnTheScreen();
  expect(screen.getByTestId("quick-add-amount")).toHaveTextContent("€0");
});

it("saves with a generated id, closes the modal and shows an Undo toast", async () => {
  await addExpense();
  await waitFor(() => expect(mocked.putTransaction).toHaveBeenCalledTimes(1));
  const [id, body] = mocked.putTransaction.mock.calls[0]!;
  expect(id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  expect(body).toMatchObject({
    kind: "expense",
    amount_minor: 1450,
    currency: "EUR",
    category_id: CAT.dining,
  });
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("Expense saved")).toBeOnTheScreen();
  expect(screen.getByTestId("toast-action")).toBeOnTheScreen();
  await settle();
});

it("Undo deletes the SAME id, after the create", async () => {
  await addExpense();
  await waitFor(() => expect(mocked.putTransaction).toHaveBeenCalledTimes(1));
  const id = mocked.putTransaction.mock.calls[0]![0];
  await fireEvent.press(await screen.findByTestId("toast-action"));
  await waitFor(() =>
    expect(mocked.deleteTransaction).toHaveBeenCalledWith(id),
  );
  expect(mocked.deleteTransaction).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId("toast")).toBeNull();
  await settle();
});

it("queues Undo behind a create that is still waiting (offline)", async () => {
  onlineManager.setOnline(false);
  client.setQueryData(["me"], me); // offline: the screen runs from the persisted cache
  client.setQueryData(["categories", true], categories);
  await addExpense();
  await fireEvent.press(await screen.findByTestId("toast-action"));
  await new Promise<void>((r) => setImmediate(r));
  expect(mocked.putTransaction).not.toHaveBeenCalled();
  expect(mocked.deleteTransaction).not.toHaveBeenCalled();
  await act(async () => {
    onlineManager.setOnline(true);
  });
  await waitFor(() =>
    expect(mocked.deleteTransaction).toHaveBeenCalledTimes(1),
  );
  expect(mocked.putTransaction.mock.invocationCallOrder[0]).toBeLessThan(
    mocked.deleteTransaction.mock.invocationCallOrder[0]!,
  );
  expect(mocked.deleteTransaction.mock.calls[0]![0]).toBe(
    mocked.putTransaction.mock.calls[0]![0],
  );
  await settle();
});

it("says Income saved for income", async () => {
  await render(<QuickAddScreen />, { wrapper: appWrapperFor(client) });
  await fireEvent.press(await screen.findByTestId("kind-income"));
  await fireEvent.press(screen.getByTestId("key-9"));
  await pressAndSettle(screen.getByTestId("quick-add-save"));
  expect(await screen.findByText("Income saved")).toBeOnTheScreen();
  await settle();
});

it("a double tap on Save creates one transaction: one id, one toast, one back", async () => {
  await addExpense(); // the helper already pressed Save once
  await pressAndSettle(screen.getByTestId("quick-add-save"));
  await pressAndSettle(screen.getByTestId("quick-add-save"));
  await waitFor(() => expect(mocked.putTransaction).toHaveBeenCalled());
  await settle();
  const ids = new Set(mocked.putTransaction.mock.calls.map((c) => c[0]));
  expect(ids.size).toBe(1);
  expect(mocked.putTransaction).toHaveBeenCalledTimes(1);
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(screen.getAllByTestId("toast")).toHaveLength(1);
});

it("shows an error with Retry when the profile cannot be loaded", async () => {
  mocked.getMe.mockRejectedValueOnce(new Error("boom"));
  await render(<QuickAddScreen />, { wrapper: appWrapperFor(client) });
  expect(
    await screen.findByText("We could not load your data."),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByTestId("key-1")).toBeOnTheScreen();
  await settle();
});
