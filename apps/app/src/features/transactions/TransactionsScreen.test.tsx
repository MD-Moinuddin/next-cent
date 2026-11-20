import { monthRange, todayIso } from "@nextcent/shared";
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
import { categories, CAT, tx } from "@/test/fixtures";
import {
  appWrapperFor,
  createTestClient,
  disposeClient,
  settle,
} from "@/test/wrapper";
import { yesterdayIso } from "./TransactionForm";
import { registerTransactionMutations, TX_PUT_KEY } from "./mutations";
import { TransactionsScreen } from "./TransactionsScreen";
import { confirmIdentity } from "@/lib/auth/identity";

jest.mock("@/lib/api", () => ({
  api: {
    listTransactions: jest.fn(),
    listCategories: jest.fn(),
    putTransaction: jest.fn(),
  },
  setTokenGetter: jest.fn(),
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
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
  mocked.listCategories.mockResolvedValue(categories);
  mocked.listTransactions.mockResolvedValue({
    items: [
      tx({ id: "a", merchant: "Lidl", occurred_on: todayIso() }),
      tx({
        id: "b",
        merchant: "Bus ticket",
        category_id: CAT.transport,
        occurred_on: todayIso(),
        tags: ["commute"],
      }),
      tx({
        id: "c",
        merchant: "Salary",
        kind: "income",
        category_id: null,
        amount_minor: 240000,
        occurred_on: yesterdayIso(),
      }),
    ],
    next_cursor: null,
  });
});
afterEach(() => disposeClient(client));

const renderList = () =>
  render(<TransactionsScreen />, { wrapper: appWrapperFor(client) });
const lastParams = () => mocked.listTransactions.mock.lastCall![0];

it("groups rows by day with friendly headers and formats amounts", async () => {
  await renderList();
  expect(await screen.findByTestId("tx-row-lidl")).toBeOnTheScreen();
  expect(screen.getByText("Today")).toBeOnTheScreen();
  expect(screen.getByText("Yesterday")).toBeOnTheScreen();
  expect(screen.getByTestId("tx-row-salary")).toHaveTextContent(/\+€2,400\.00/);
  expect(screen.getByTestId("tx-row-lidl")).toHaveTextContent(/−€32\.15/);
  expect(screen.getByTestId("tx-row-bus-ticket")).toHaveTextContent(/#commute/);
  // The accessible name comes from the visible text, so it always includes it (WCAG 2.5.3).
  // The accessible name begins with the visible text (WCAG 2.5.3), then adds the direction and amount in words.
  expect(screen.getByTestId("tx-row-lidl").props.accessibilityLabel).toBe(
    "Lidl Groceries −€32.15, Expense, 32.15 euros",
  );
  await settle();
});

it("starts on this month and requests that range", async () => {
  await renderList();
  await screen.findByTestId("tx-row-lidl");
  expect(lastParams()).toMatchObject({ ...monthRange(new Date()), limit: 30 });
  await settle();
});

it("changes the query when range, type and category filters change", async () => {
  await renderList();
  await screen.findByTestId("tx-row-lidl");
  await fireEvent.press(screen.getByTestId("range-all"));
  await waitFor(() => expect(lastParams().from).toBeUndefined());
  expect(lastParams().to).toBeUndefined();
  await fireEvent.press(screen.getByTestId("range-last"));
  const now = new Date();
  await waitFor(() =>
    expect(lastParams()).toMatchObject(
      monthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    ),
  );
  await fireEvent.press(screen.getByTestId("kind-expense"));
  await waitFor(() => expect(lastParams().kind).toBe("expense"));
  await fireEvent.press(screen.getByTestId("kind-income"));
  await waitFor(() => expect(lastParams().kind).toBe("income"));
  await fireEvent.press(screen.getByTestId("filter-category"));
  await fireEvent.press(await screen.findByTestId("filter-category-groceries"));
  await waitFor(() => expect(lastParams().category_id).toBe(CAT.groceries));
  expect(screen.getByText("Groceries ▾")).toBeOnTheScreen();
  await settle();
});

it("debounces search by 300 ms", async () => {
  await renderList();
  await screen.findByTestId("tx-row-lidl");
  const calls = mocked.listTransactions.mock.calls.length;
  await fireEvent.changeText(screen.getByTestId("tx-search"), "lid");
  await fireEvent.changeText(screen.getByTestId("tx-search"), "lidl");
  expect(mocked.listTransactions.mock.calls.length).toBe(calls);
  await waitFor(() => expect(lastParams().q).toBe("lidl"));
  // intermediate text was never queried
  expect(mocked.listTransactions.mock.calls.some(([p]) => p.q === "lid")).toBe(
    false,
  );
  await settle();
});

it("shows the pending-sync marker for rows with a queued save", async () => {
  await renderList();
  await screen.findByTestId("tx-row-lidl");
  expect(screen.queryByText(/pending sync/)).toBeNull();
  await act(async () => {
    onlineManager.setOnline(false);
  });
  await act(async () => {
    void client
      .getMutationCache()
      .build(client, { mutationKey: TX_PUT_KEY })
      .execute({
        id: "a",
        body: {
          kind: "expense",
          amount_minor: 3215,
          currency: "EUR",
          occurred_on: todayIso(),
          category_id: CAT.groceries,
          merchant: "Lidl",
          tags: [],
        },
      })
      .catch(() => undefined);
  });
  expect(await screen.findByText(/⏳ pending sync/)).toBeOnTheScreen();
  expect(screen.getByTestId("tx-row-lidl").props.accessibilityLabel).toContain(
    ", pending sync",
  );
  await settle();
});

it("navigates to the edit screen on row press", async () => {
  await renderList();
  await fireEvent.press(await screen.findByTestId("tx-row-lidl"));
  expect(mockPush).toHaveBeenCalledWith("/transaction/a");
  await settle();
});

it("loads the next page at the end of the list", async () => {
  mocked.listTransactions
    .mockResolvedValueOnce({ items: [tx({ id: "a" })], next_cursor: "CUR1" })
    .mockResolvedValue({
      items: [tx({ id: "z", merchant: "Older", occurred_on: "2026-11-01" })],
      next_cursor: null,
    });
  await renderList();
  await screen.findByTestId("tx-row-lidl");
  await act(async () => {
    fireEvent(screen.getByTestId("tx-list"), "endReached");
  });
  await waitFor(() => expect(lastParams().cursor).toBe("CUR1"));
  expect(await screen.findByTestId("tx-row-older")).toBeOnTheScreen();
  await settle();
});

it("refetches on pull-to-refresh", async () => {
  await renderList();
  await screen.findByTestId("tx-row-lidl");
  const calls = mocked.listTransactions.mock.calls.length;
  const list = screen.getByTestId("tx-list");
  await act(async () => {
    list.props.refreshControl.props.onRefresh();
  });
  await waitFor(() =>
    expect(mocked.listTransactions.mock.calls.length).toBeGreaterThan(calls),
  );
  await settle();
});

it("shows empty and filtered-empty states", async () => {
  mocked.listTransactions.mockResolvedValue({ items: [], next_cursor: null });
  await renderList();
  expect(await screen.findByTestId("tx-empty")).toHaveTextContent(
    /No transactions yet/,
  );
  await fireEvent.press(screen.getByTestId("kind-income"));
  await waitFor(() =>
    expect(screen.getByTestId("tx-empty")).toHaveTextContent(
      /No transactions match these filters/,
    ),
  );
  await settle();
});

it("shows an error state with Retry", async () => {
  mocked.listTransactions.mockRejectedValueOnce(new ApiError(500));
  await renderList();
  const alert = await screen.findByText("We could not load your transactions.");
  expect(alert.props.accessibilityRole).toBe("alert");
  await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByTestId("tx-row-lidl")).toBeOnTheScreen();
  await settle();
});
