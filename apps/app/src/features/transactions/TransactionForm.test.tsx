import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { todayIso } from "@nextcent/shared";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { categories, CAT, tx } from "@/test/fixtures";
import {
  createTestClient,
  disposeClient,
  wrapperFor,
  pressAndSettle,
} from "@/test/wrapper";
import { TransactionForm, yesterdayIso } from "./TransactionForm";

jest.mock("@/lib/api", () => ({
  api: { listCategories: jest.fn(), listTransactions: jest.fn() },
}));
const mocked = jest.mocked(api);

let client: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  client = createTestClient();
  mocked.listCategories.mockResolvedValue(categories);
  mocked.listTransactions.mockResolvedValue({ items: [], next_cursor: null });
});
afterEach(() => disposeClient(client));

async function renderForm(
  props: Partial<React.ComponentProps<typeof TransactionForm>> = {},
) {
  const onSubmit = jest.fn();
  await render(
    <TransactionForm
      mode="create"
      homeCurrency="EUR"
      onSubmit={onSubmit}
      {...props}
    />,
    { wrapper: wrapperFor(client) },
  );
  await screen.findByTestId("category-chip-dining");
  return onSubmit;
}
const keys = async (...ks: string[]) => {
  for (const k of ks) {
    const id = k === "." ? "key-dot" : k === "back" ? "key-back" : `key-${k}`;
    await fireEvent.press(screen.getByTestId(id));
  }
};
const save = () => pressAndSettle(screen.getByTestId("quick-add-save"));

it("builds the minor-unit body from keypad input", async () => {
  const onSubmit = await renderForm();
  await keys("1", "4", ".", "5", "0");
  expect(screen.getByTestId("quick-add-amount")).toHaveTextContent("€14.50");
  await fireEvent.press(screen.getByTestId("category-chip-dining"));
  await fireEvent.changeText(
    screen.getByTestId("quick-add-merchant"),
    " Lunch ",
  );
  await fireEvent.changeText(
    screen.getByTestId("quick-add-tags"),
    "weekly, , lunch ,weekly",
  );
  await save();
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit).toHaveBeenCalledWith({
    kind: "expense",
    amount_minor: 1450,
    currency: "EUR",
    occurred_on: todayIso(),
    category_id: CAT.dining,
    merchant: "Lunch",
    note: null,
    tags: ["weekly", "lunch"],
    base_version: undefined,
  });
});

it("does not submit an expense without a category and announces the error", async () => {
  const onSubmit = await renderForm();
  await keys("5");
  await save();
  const alert = await screen.findByText("Choose a category");
  expect(alert).toBeOnTheScreen();
  expect(alert.props.accessibilityRole).toBe("alert");
  expect(onSubmit).not.toHaveBeenCalled();
});

it("does not submit an empty amount", async () => {
  const onSubmit = await renderForm();
  await fireEvent.press(screen.getByTestId("category-chip-dining"));
  await save();
  expect(await screen.findByText("Enter an amount")).toBeOnTheScreen();
  expect(onSubmit).not.toHaveBeenCalled();
});

it("hides category chips for income and sends no category", async () => {
  const onSubmit = await renderForm();
  await fireEvent.press(screen.getByTestId("category-chip-dining"));
  await fireEvent.press(screen.getByTestId("kind-income"));
  expect(screen.queryByTestId("category-chip-dining")).toBeNull();
  expect(screen.getByText("Add income")).toBeOnTheScreen();
  await keys("2", "0");
  await save();
  await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  expect(onSubmit.mock.calls[0]![0]).toMatchObject({
    kind: "income",
    amount_minor: 2000,
    category_id: null,
  });
});

it("sets the date from the Yesterday chip, the Today chip and the text field", async () => {
  const onSubmit = await renderForm();
  await keys("3");
  await fireEvent.press(screen.getByTestId("category-chip-dining"));
  await fireEvent.press(screen.getByTestId("date-yesterday"));
  expect(screen.getByTestId("quick-add-date").props.value).toBe(yesterdayIso());
  await save();
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit.mock.calls[0]![0].occurred_on).toBe(yesterdayIso());
  await fireEvent.press(screen.getByTestId("date-today"));
  expect(screen.getByTestId("quick-add-date").props.value).toBe(todayIso());
  await fireEvent.changeText(
    screen.getByTestId("quick-add-date"),
    "2026-02-31",
  );
  await save();
  expect(await screen.findByText(/valid date/)).toBeOnTheScreen();
  expect(onSubmit).toHaveBeenCalledTimes(1);
  await fireEvent.changeText(
    screen.getByTestId("quick-add-date"),
    "2026-10-01",
  );
  await save();
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
  expect(onSubmit.mock.calls[1]![0].occurred_on).toBe("2026-10-01");
});

it("orders category chips by usage in recent transactions and hides archived ones", async () => {
  mocked.listCategories.mockResolvedValue([
    ...categories,
    {
      ...categories[0]!,
      id: "9f1b1a0e-6d1c-4c58-8c0e-0d7f5d5f4b09",
      name: "Old",
      archived_at: "2026-01-01T00:00:00Z",
    },
  ]);
  mocked.listTransactions.mockResolvedValue({
    items: [
      tx({ id: "a", category_id: CAT.transport }),
      tx({ id: "b", category_id: CAT.transport }),
      tx({ id: "c", category_id: CAT.groceries }),
    ],
    next_cursor: null,
  });
  await render(
    <TransactionForm mode="create" homeCurrency="EUR" onSubmit={jest.fn()} />,
    { wrapper: wrapperFor(client) },
  );
  await waitFor(() =>
    expect(
      screen
        .getAllByTestId(/^category-chip-(?!more)/)
        .map((n) => n.props.testID),
    ).toEqual([
      "category-chip-transport",
      "category-chip-groceries",
      "category-chip-dining",
    ]),
  );
  expect(screen.queryByTestId("category-chip-old")).toBeNull();
});

it("collapses to five chips behind More", async () => {
  mocked.listCategories.mockResolvedValue(
    Array.from({ length: 7 }, (_, i) => ({
      ...categories[0]!,
      id: `3f1b1a0e-6d1c-4c58-8c0e-0d7f5d5f4c0${i}`,
      name: `Cat${i}`,
    })),
  );
  await render(
    <TransactionForm mode="create" homeCurrency="EUR" onSubmit={jest.fn()} />,
    { wrapper: wrapperFor(client) },
  );
  await screen.findByTestId("category-chip-cat0");
  expect(screen.queryByTestId("category-chip-cat6")).toBeNull();
  await fireEvent.press(screen.getByTestId("category-chip-more"));
  expect(screen.getByTestId("category-chip-cat6")).toBeOnTheScreen();
});

it("limits the keypad to the currency exponent (JPY has no dot)", async () => {
  await renderForm({ homeCurrency: "JPY" });
  await keys("1", "2", ".", "5");
  expect(screen.getByTestId("quick-add-amount")).toHaveTextContent("¥125");
  expect(screen.getByTestId("key-dot").props.accessibilityState).toMatchObject({
    disabled: true,
  });
});

describe("edit mode", () => {
  const initial = {
    kind: "expense" as const,
    amount: "32.15",
    currency: "EUR",
    occurredOn: "2026-11-17",
    categoryId: CAT.groceries,
    merchant: "Lidl",
    note: "Weekly shop",
    tags: ["weekly"],
  };

  it("prefills and sends base_version and the edited amount", async () => {
    const onSubmit = await renderForm({
      mode: "edit",
      initial,
      baseVersion: 3,
    });
    expect(screen.getByTestId("quick-add-amount")).toHaveTextContent("€32.15");
    expect(screen.getByTestId("quick-add-merchant").props.value).toBe("Lidl");
    expect(screen.getByTestId("quick-add-tags").props.value).toBe("weekly");
    expect(screen.getByText("Edit expense")).toBeOnTheScreen();
    expect(screen.getByText("Save changes")).toBeOnTheScreen();
    await keys("back");
    await keys("0");
    await save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      kind: "expense",
      amount_minor: 3210,
      currency: "EUR",
      occurred_on: "2026-11-17",
      category_id: CAT.groceries,
      merchant: "Lidl",
      note: "Weekly shop",
      tags: ["weekly"],
      base_version: 3,
    });
  });

  it("shows Delete only in edit mode and calls onDelete", async () => {
    const onDelete = jest.fn();
    await renderForm({ mode: "edit", initial, baseVersion: 1, onDelete });
    await fireEvent.press(screen.getByTestId("transaction-delete"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("has no Delete button when creating", async () => {
    await renderForm({ onDelete: jest.fn() });
    expect(screen.queryByTestId("transaction-delete")).toBeNull();
  });
});

describe("validation mirrors the server", () => {
  const prepare = async () => {
    const onSubmit = await renderForm();
    await keys("5");
    await fireEvent.press(screen.getByTestId("category-chip-dining"));
    return onSubmit;
  };

  it.each([
    ["1999-12-31", false],
    ["2000-01-01", true],
    ["2100-12-31", true],
    ["2101-01-01", false],
  ])("date %s accepted: %s", async (date, ok) => {
    const onSubmit = await prepare();
    await fireEvent.changeText(screen.getByTestId("quick-add-date"), date);
    await save();
    if (ok) await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    else {
      expect(
        await screen.findByText(/between 2000-01-01 and 2100-12-31/),
      ).toBeOnTheScreen();
      expect(onSubmit).not.toHaveBeenCalled();
    }
  });

  it("flags a 31-character tag, a 121-character merchant and a 501-character note", async () => {
    const onSubmit = await prepare();
    await fireEvent.changeText(
      screen.getByTestId("quick-add-tags"),
      "t".repeat(31),
    );
    await fireEvent.changeText(
      screen.getByTestId("quick-add-merchant"),
      "m".repeat(121),
    );
    await fireEvent.changeText(
      screen.getByTestId("quick-add-note"),
      "n".repeat(501),
    );
    await save();
    expect(
      await screen.findByText(/Each tag can have at most 30/),
    ).toBeOnTheScreen();
    expect(screen.getByText(/at most 120 characters/)).toBeOnTheScreen();
    expect(screen.getByText(/at most 500 characters/)).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
    await fireEvent.changeText(
      screen.getByTestId("quick-add-tags"),
      "t".repeat(30),
    );
    await fireEvent.changeText(
      screen.getByTestId("quick-add-merchant"),
      "m".repeat(120),
    );
    await fireEvent.changeText(
      screen.getByTestId("quick-add-note"),
      "n".repeat(500),
    );
    await save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("flags more than 20 tags and dedupes case-insensitively before counting", async () => {
    const onSubmit = await prepare();
    const many = Array.from({ length: 21 }, (_, i) => `t${i}`).join(",");
    await fireEvent.changeText(screen.getByTestId("quick-add-tags"), many);
    await save();
    expect(await screen.findByText("Use at most 20 tags")).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId("quick-add-tags"), "A, a, B");
    await save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0].tags).toEqual(["A", "B"]);
  });

  it("never fails silently: an announced summary appears with the field errors", async () => {
    const onSubmit = await renderForm();
    expect(screen.queryByTestId("form-error-summary")).toBeNull();
    await save();
    const summary = await screen.findByTestId("form-error-summary");
    expect(summary).toHaveTextContent("Check the highlighted fields");
    expect(summary.props.accessibilityRole).toBe("alert");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("accepts a trailing-dot amount as typed", async () => {
    const onSubmit = await renderForm();
    await keys("5", ".");
    expect(screen.getByTestId("quick-add-amount")).toHaveTextContent("€5.");
    await fireEvent.press(screen.getByTestId("category-chip-dining"));
    await save();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0].amount_minor).toBe(500);
  });
});

it("shows an error with Retry instead of category chips when categories fail to load", async () => {
  mocked.listCategories.mockRejectedValueOnce(new Error("down"));
  await render(
    <TransactionForm mode="create" homeCurrency="EUR" onSubmit={jest.fn()} />,
    { wrapper: wrapperFor(client) },
  );
  expect(
    await screen.findByText("We could not load your categories."),
  ).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId("categories-retry"));
  expect(await screen.findByTestId("category-chip-dining")).toBeOnTheScreen();
});
