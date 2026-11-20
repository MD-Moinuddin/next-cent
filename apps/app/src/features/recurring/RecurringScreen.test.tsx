import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { t } from "@/i18n/strings";
import { api } from "@/lib/api";
import { ApiError, NetworkError } from "@/lib/query/errors";
import { queryKeys } from "@/lib/query/queryClient";
import type { RecurringOut } from "@/lib/types";
import { CAT, categories, me } from "@/test/fixtures";
import {
  createTestClient,
  disposeClient,
  pressAndSettle,
  wrapperFor,
} from "@/test/wrapper";
import { todayIso } from "@nextcent/shared";
import { anchorWindow, shiftIsoDate } from "./RecurringForm";
import { RecurringScreen } from "./RecurringScreen";

jest.mock("@/lib/api", () => ({
  api: {
    getMe: jest.fn(),
    listCategories: jest.fn(),
    listRecurring: jest.fn(),
    createRecurring: jest.fn(),
    patchRecurring: jest.fn(),
  },
}));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
const mocked = jest.mocked(api);

const rule = (over: Partial<RecurringOut> = {}): RecurringOut => ({
  id: "r1",
  active: true,
  amount_minor: 85000,
  anchor_on: "2026-11-01",
  cadence: "monthly",
  category_id: CAT.dining,
  currency: "EUR",
  is_primary_income: false,
  kind: "expense",
  merchant: "Rent",
  next_due_on: "2026-12-01",
  ...over,
});
const rules = [
  rule(),
  rule({ id: "r2", merchant: "Netflix", amount_minor: 1299, active: false }),
  rule({
    id: "r3",
    kind: "income",
    is_primary_income: true,
    merchant: null,
    category_id: null,
    amount_minor: 240000,
  }),
  rule({ id: "r4", kind: "income", merchant: "Side gig", category_id: null }),
];
let client: QueryClient;
const toggle = (sw: Parameters<typeof fireEvent>[0], value: boolean) =>
  act(async () => {
    await fireEvent(sw, "valueChange", value);
    await settleMicro();
  });
const settleMicro = async () => {
  for (let i = 0; i < 50; i++) await new Promise<void>((r) => setImmediate(r));
};

async function setup(list: RecurringOut[] = rules) {
  mocked.listRecurring.mockResolvedValue(list);
  client.setQueryData(queryKeys.recurring, list);
  client.setQueryData(queryKeys.me, me);
  client.setQueryData(queryKeys.categories(false), categories);
  await render(<RecurringScreen />, { wrapper: wrapperFor(client) });
}

beforeEach(() => {
  jest.clearAllMocks();
  client = createTestClient();
});
afterEach(() => disposeClient(client));

it("lists expense and income sections with cadence, next due date and amount", async () => {
  await setup();
  expect(screen.getByText(t.recurring.expenses)).toBeTruthy();
  expect(screen.getByText(t.recurring.income)).toBeTruthy();
  expect(screen.getByText("Rent")).toBeTruthy();
  expect(screen.getByText("Netflix")).toBeTruthy();
  expect(screen.getAllByText("Monthly · Next: 2026-12-01").length).toBe(4);
  expect(screen.getAllByText("€850.00")).toHaveLength(2);
  expect(screen.getByText("€12.99")).toBeTruthy();
});

it("labels the primary income rule and gives it no switch or delete", async () => {
  await setup();
  expect(screen.getByText(t.recurring.monthlyIncome)).toBeTruthy();
  expect(screen.getByText(t.recurring.monthlyIncomeHint)).toBeTruthy();
  expect(screen.queryByTestId("recurring-active-r3")).toBeNull();
  expect(screen.getByTestId("recurring-active-r1")).toBeTruthy();
});

it("does not describe resuming as back-filling", async () => {
  await setup();
  expect(screen.getByText(t.recurring.activeHint)).toBeTruthy();
  expect(t.recurring.activeHint).not.toMatch(/back-?fill|catch up/i);
});

it("calls patch with the new active state from the switch", async () => {
  await setup();
  mocked.patchRecurring.mockResolvedValue(rule({ id: "r2", active: true }));
  const sw = screen.getByLabelText("Active: Netflix");
  expect(sw.props.value).toBe(false);
  await toggle(sw, true);
  expect(mocked.patchRecurring).toHaveBeenCalledWith("r2", { active: true });
});

it("shows the offline message when toggling fails offline", async () => {
  await setup();
  mocked.patchRecurring.mockRejectedValue(new NetworkError(new Error("x")));
  await toggle(screen.getByLabelText("Active: Rent"), false);
  expect(screen.getByText(t.common.offlineOnly)).toBeTruthy();
});

describe("create form", () => {
  async function open() {
    await fireEvent.press(screen.getByTestId("recurring-new"));
  }

  it("validates amount, category and date before calling the API", async () => {
    await setup();
    await open();
    await pressAndSettle(screen.getByTestId("recurring-save"));
    expect(screen.getByText(t.errors.amount_required)).toBeTruthy();
    expect(screen.getByText(t.errors.category_required)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId("recurring-amount"), "0");
    await fireEvent.changeText(
      screen.getByTestId("recurring-start"),
      "2026-02-30",
    );
    await pressAndSettle(screen.getByTestId("recurring-save"));
    expect(screen.getByText(t.errors.invalid_amount)).toBeTruthy();
    expect(screen.getByText(t.errors.invalid_date)).toBeTruthy();
    expect(mocked.createRecurring).not.toHaveBeenCalled();
  });

  it("rejects start dates outside the window the API accepts", async () => {
    await setup();
    const today = todayIso();
    const { min, max } = anchorWindow(today);
    expect(min).toBe(shiftIsoDate(today, -365));
    expect(max).toBe(shiftIsoDate(today, 3659));
    await open();
    await fireEvent.press(screen.getByTestId("recurring-kind-income"));
    await fireEvent.changeText(screen.getByTestId("recurring-amount"), "20");
    for (const bad of [shiftIsoDate(min, -1), shiftIsoDate(max, 1)]) {
      await fireEvent.changeText(screen.getByTestId("recurring-start"), bad);
      await pressAndSettle(screen.getByTestId("recurring-save"));
      expect(screen.getByText(t.errors.anchor_out_of_range)).toBeTruthy();
    }
    expect(mocked.createRecurring).not.toHaveBeenCalled();
    mocked.createRecurring.mockResolvedValue(rule({ id: "r9" }));
    await fireEvent.changeText(screen.getByTestId("recurring-start"), min);
    await pressAndSettle(screen.getByTestId("recurring-save"));
    expect(mocked.createRecurring).toHaveBeenCalledWith(
      expect.objectContaining({ anchor_on: min }),
    );
  });

  it("shows the rule-cap message when the API refuses a 101st rule", async () => {
    await setup();
    mocked.createRecurring.mockRejectedValueOnce(
      new ApiError(409, { code: "too_many_rules" }),
    );
    await open();
    await fireEvent.press(screen.getByTestId("recurring-kind-income"));
    await fireEvent.changeText(screen.getByTestId("recurring-amount"), "20");
    await pressAndSettle(screen.getByTestId("recurring-save"));
    expect(screen.getByText(t.errors.too_many_rules)).toBeTruthy();
  });

  it("creates a monthly expense rule in the home currency", async () => {
    await setup();
    mocked.createRecurring.mockResolvedValue(rule({ id: "r9" }));
    await open();
    await fireEvent.changeText(
      screen.getByTestId("recurring-amount"),
      "850.00",
    );
    await fireEvent.press(screen.getByTestId("category-chip-dining"));
    await fireEvent.changeText(
      screen.getByTestId("recurring-start"),
      "2026-12-01",
    );
    await fireEvent.changeText(
      screen.getByTestId("recurring-merchant"),
      " Rent ",
    );
    await pressAndSettle(screen.getByTestId("recurring-save"));
    expect(mocked.createRecurring).toHaveBeenCalledWith({
      kind: "expense",
      amount_minor: 85000,
      currency: "EUR",
      cadence: "monthly",
      anchor_on: "2026-12-01",
      category_id: CAT.dining,
      merchant: "Rent",
    });
    expect(screen.queryByTestId("recurring-save")).toBeNull();
  });

  it("creates an income rule without a category", async () => {
    await setup();
    mocked.createRecurring.mockResolvedValue(
      rule({ id: "r9", kind: "income" }),
    );
    await open();
    await fireEvent.press(screen.getByTestId("recurring-kind-income"));
    await fireEvent.press(screen.getByTestId("recurring-cadence-weekly"));
    await fireEvent.changeText(screen.getByTestId("recurring-amount"), "20");
    await fireEvent.changeText(
      screen.getByTestId("recurring-start"),
      "2026-12-01",
    );
    await pressAndSettle(screen.getByTestId("recurring-save"));
    expect(mocked.createRecurring).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "income",
        cadence: "weekly",
        category_id: null,
        merchant: null,
        amount_minor: 2000,
      }),
    );
  });

  it("maps server and offline failures", async () => {
    await setup();
    mocked.createRecurring.mockRejectedValueOnce(
      new NetworkError(new Error("x")),
    );
    await open();
    await fireEvent.press(screen.getByTestId("recurring-kind-income"));
    await fireEvent.changeText(screen.getByTestId("recurring-amount"), "20");
    await fireEvent.changeText(
      screen.getByTestId("recurring-start"),
      "2026-12-01",
    );
    await pressAndSettle(screen.getByTestId("recurring-save"));
    expect(screen.getByText(t.common.offlineOnly)).toBeTruthy();
    mocked.createRecurring.mockRejectedValueOnce(
      new ApiError(500, { code: "boom" }),
    );
    await pressAndSettle(screen.getByTestId("recurring-save"));
    expect(screen.getByText(t.errors.generic)).toBeTruthy();
  });
});
