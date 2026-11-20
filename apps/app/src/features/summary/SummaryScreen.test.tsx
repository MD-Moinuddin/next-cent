import type { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { t } from "@/i18n/strings";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { ApiError } from "@/lib/query/errors";
import {
  createTestClient,
  disposeClient,
  pressAndSettle,
  settle,
  wrapperFor,
} from "@/test/wrapper";
import { rangeFor, shiftReference } from "./ranges";
import { SummaryScreen } from "./SummaryScreen";

jest.mock("@/lib/api", () => ({ api: { getSummary: jest.fn() } }));
const mocked = jest.mocked(api);

const summary = (over = {}) => ({
  balance_minor: 182640,
  by_category: [
    { category_id: "c1", icon: "🛒", name: "Groceries", total_minor: 12000 },
    { category_id: "c2", icon: "🚌", name: "Transport", total_minor: 4700 },
  ],
  currency: "EUR",
  excluded_other_currency_count: 0,
  expense_minor: 16700,
  income_minor: 240000,
  net_minor: 223300,
  range_start: "2026-11-01",
  range_end: "2026-11-30",
  ...over,
});
const eur = (n: number) => formatMoney(n, "EUR", "en-US");
let client: QueryClient;

async function setup() {
  await render(<SummaryScreen />, { wrapper: wrapperFor(client) });
  await settle();
}
const lastCall = () => mocked.getSummary.mock.calls.at(-1);

beforeEach(() => {
  jest.clearAllMocks();
  client = createTestClient();
  mocked.getSummary.mockResolvedValue(summary());
});
afterEach(() => disposeClient(client));

it("loads the current month by default and shows totals and bars", async () => {
  await setup();
  const { from, to } = rangeFor("month", new Date());
  expect(lastCall()).toEqual([from, to]);
  expect(screen.getByLabelText(`Income, ${eur(240000)}`)).toBeTruthy();
  expect(screen.getByLabelText(`Spent, ${eur(16700)}`)).toBeTruthy();
  expect(screen.getByLabelText(`Net, ${eur(223300)}`)).toBeTruthy();
  expect(screen.getByLabelText(`Groceries, ${eur(12000)}`)).toBeTruthy();
  expect(screen.getByTestId("bar-c1").props.style.width).toBe("100%");
  expect(screen.getByTestId("bar-c2").props.style.width).toBe("39%");
});

it("switching to week and shifting changes the queried range", async () => {
  await setup();
  await fireEvent.press(screen.getByTestId("summary-mode-week"));
  await settle();
  const now = new Date();
  expect(lastCall()).toEqual([
    rangeFor("week", now).from,
    rangeFor("week", now).to,
  ]);
  await fireEvent.press(screen.getByTestId("summary-prev"));
  await settle();
  const prev = rangeFor("week", shiftReference("week", now, -1));
  expect(lastCall()).toEqual([prev.from, prev.to]);
  await fireEvent.press(screen.getByTestId("summary-next"));
  await fireEvent.press(screen.getByTestId("summary-next"));
  await settle();
  const next = rangeFor("week", shiftReference("week", now, 1));
  expect(lastCall()).toEqual([next.from, next.to]);
});

it("shifts months with the previous button", async () => {
  await setup();
  await fireEvent.press(screen.getByTestId("summary-prev"));
  await settle();
  const prev = rangeFor("month", shiftReference("month", new Date(), -1));
  expect(lastCall()).toEqual([prev.from, prev.to]);
});

describe("custom range", () => {
  async function custom() {
    await setup();
    await fireEvent.press(screen.getByTestId("summary-mode-custom"));
    await settle();
    mocked.getSummary.mockClear();
  }
  const enter = async (from: string, to: string) => {
    await fireEvent.changeText(screen.getByTestId("summary-from"), from);
    await fireEvent.changeText(screen.getByTestId("summary-to"), to);
    await settle();
  };

  it("queries a valid range", async () => {
    await custom();
    await enter("2026-10-01", "2026-10-15");
    expect(lastCall()).toEqual(["2026-10-01", "2026-10-15"]);
  });

  it("rejects malformed, reversed and too long ranges without querying", async () => {
    await custom();
    await enter("2026-1-1", "2026-10-15");
    expect(screen.getByText(t.errors.invalid_date)).toBeTruthy();
    await enter("2026-10-16", "2026-10-15");
    expect(screen.getByText(t.errors.invalid_range)).toBeTruthy();
    await enter("2000-01-01", "2026-10-15");
    expect(screen.getByText(t.errors.range_too_long)).toBeTruthy();
    expect(mocked.getSummary).not.toHaveBeenCalled();
  });
});

it("shows the empty state", async () => {
  mocked.getSummary.mockResolvedValue(
    summary({
      by_category: [],
      expense_minor: 0,
      income_minor: 0,
      net_minor: 0,
    }),
  );
  await setup();
  expect(screen.getByText(t.summary.empty)).toBeTruthy();
  expect(screen.queryByTestId("bar-c1")).toBeNull();
});

it("notes entries in other currencies that are excluded", async () => {
  mocked.getSummary.mockResolvedValue(
    summary({ excluded_other_currency_count: 2 }),
  );
  await setup();
  expect(screen.getByText(t.summary.excluded(2))).toBeTruthy();
});

it("shows an error state with a retry", async () => {
  mocked.getSummary.mockRejectedValueOnce(new ApiError(500, { code: "boom" }));
  await setup();
  expect(screen.getByText(t.summary.loadError)).toBeTruthy();
  await pressAndSettle(screen.getByLabelText(t.common.retry));
  expect(screen.getByLabelText(`Income, ${eur(240000)}`)).toBeTruthy();
});
