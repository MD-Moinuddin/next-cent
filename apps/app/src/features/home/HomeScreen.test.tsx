import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/query/errors";
import { queryKeys } from "@/lib/query/queryClient";
import { createTestClient, wrapperFor } from "@/test/wrapper";
import { HomeScreen } from "./HomeScreen";
import { toIsoDate } from "@nextcent/shared";
import { currentMonth } from "@/features/summary/ranges";
import { formatMoney } from "@/lib/format";

jest.mock("@/lib/api", () => ({
  api: {
    getMe: jest.fn(),
    getSummary: jest.fn(),
    listTransactions: jest.fn(),
    listCategories: jest.fn(),
  },
}));
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));
const mocked = jest.mocked(api);

const me = {
  id: "u1",
  created_at: "2026-11-01T00:00:00Z",
  home_currency: "EUR",
  monthly_income_minor: 240000,
  onboarding_completed: true,
  opening_balance_minor: 100000,
};
const summary = (over = {}) => ({
  balance_minor: 182640,
  by_category: [],
  currency: "EUR",
  excluded_other_currency_count: 0,
  expense_minor: 82360,
  income_minor: 240000,
  net_minor: 157640,
  range_start: "2026-11-01",
  range_end: "2026-11-30",
  ...over,
});
const tx = (over = {}) => ({
  id: "t1",
  amount_minor: 3215,
  category_id: "c1",
  created_at: "2026-11-17T10:00:00Z",
  currency: "EUR",
  deleted_at: null,
  kind: "expense",
  merchant: "Lidl",
  note: null,
  occurred_on: toIsoDate(new Date()),
  recurring_id: null,
  tags: [],
  updated_at: "2026-11-17T10:00:00Z",
  version: 1,
  ...over,
});

let client: QueryClient;
const eur = (minor: number) => formatMoney(minor, "EUR", "en-US");
async function renderHome() {
  await render(<HomeScreen />, { wrapper: wrapperFor(client) });
}

beforeEach(() => {
  jest.clearAllMocks();
  client = createTestClient();
  mocked.getMe.mockResolvedValue(me);
  mocked.getSummary.mockResolvedValue(summary());
  mocked.listTransactions.mockResolvedValue({
    items: [
      tx(),
      tx({ id: "t2", merchant: null, category_id: "c2", amount_minor: 320 }),
    ],
    next_cursor: null,
  });
  mocked.listCategories.mockResolvedValue([
    { id: "c1", name: "Groceries", icon: "x", color: null, archived_at: null },
    { id: "c2", name: "Transport", icon: "x", color: null, archived_at: null },
  ] as never);
});

it("shows the summary balance and recent rows formatted via useMoney", async () => {
  await renderHome();
  expect(await screen.findByTestId("home-balance")).toHaveTextContent(
    eur(182640),
  );
  expect(await screen.findByText("Lidl")).toBeOnTheScreen();
  expect(await screen.findByText(/Groceries · Today/)).toBeOnTheScreen();
  expect(screen.getByText(`−${eur(3215)}`)).toBeOnTheScreen();
  // no merchant: falls back to the category name
  expect(screen.getAllByText("Transport").length).toBeGreaterThan(0);
  expect(screen.queryByText(/not included/)).toBeNull();
  expect(mocked.getSummary).toHaveBeenCalledWith(
    currentMonth().from,
    currentMonth().to,
  );
  expect(mocked.listTransactions).toHaveBeenCalledWith({
    limit: 5,
    cursor: undefined,
  });
});

it("adds pending offline creates to the balance", async () => {
  client.getMutationCache().build(client, {
    mutationKey: ["transactions", "put"],
    mutationFn: () => new Promise(() => {}),
  });
  const m = client.getMutationCache().build(client, {
    mutationKey: ["transactions", "put"],
    mutationFn: () => new Promise(() => {}),
  });
  void m.execute({
    id: "p1",
    body: {
      kind: "expense",
      amount_minor: 1000,
      currency: "EUR",
      occurred_on: "2026-11-17",
      base_version: null,
    },
  });
  await renderHome();
  await waitFor(() =>
    expect(screen.getByTestId("home-balance")).toHaveTextContent(eur(181640)),
  );
});

it("shows the empty state", async () => {
  mocked.listTransactions.mockResolvedValue({ items: [], next_cursor: null });
  await renderHome();
  expect(
    await screen.findByText(
      "No transactions yet. Tap + to add your first expense.",
    ),
  ).toBeOnTheScreen();
});

it("shows the excluded other currencies notice", async () => {
  mocked.getSummary.mockResolvedValue(
    summary({ excluded_other_currency_count: 3 }),
  );
  await renderHome();
  expect(
    await screen.findByText("3 entries in other currencies are not included"),
  ).toBeOnTheScreen();
});

it("shows an error state and retries", async () => {
  mocked.getSummary.mockRejectedValueOnce(new ApiError(500));
  await renderHome();
  expect(await screen.findByRole("alert")).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByTestId("home-balance")).toHaveTextContent(
    eur(182640),
  );
});

it("opens a transaction when a recent row is pressed", async () => {
  await renderHome();
  await fireEvent.press(await screen.findByTestId("recent-t1"));
  expect(mockPush).toHaveBeenCalledWith("/transaction/t1");
});

it("uses the shared list query key so optimistic updates apply", async () => {
  await renderHome();
  await screen.findByTestId("home-balance");
  expect(
    client.getQueryData(queryKeys.transactionList({ limit: 5 })),
  ).toBeDefined();
});
