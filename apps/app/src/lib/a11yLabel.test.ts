import { labelInName, spokenAmount, transactionLabel } from "./a11yLabel";

const base = {
  kind: "expense",
  minor: 3215,
  currency: "EUR",
  locale: "en-US",
  pending: false,
};

it("labelInName begins with the visible text and appends extras, skipping empty ones", () => {
  expect(
    labelInName(["Lidl", "Groceries", "−€32.15"], "Expense", "", null),
  ).toBe("Lidl Groceries −€32.15, Expense");
  expect(labelInName(["Categories", "Manage"])).toBe("Categories Manage");
});

it("spokenAmount spells the currency", () => {
  expect(spokenAmount(1450, "EUR", "en-US")).toBe("14.50 euros");
});

describe("transactionLabel", () => {
  const visible = ["Lidl", "Groceries", "−€32.15"];
  it("starts with the exact visible text and includes the direction and amount in words", () => {
    const label = transactionLabel({ ...base, visible });
    expect(label.startsWith("Lidl Groceries −€32.15")).toBe(true);
    expect(label).toContain("Expense");
    expect(label).toContain("32.15 euros");
    expect(label).not.toContain("pending sync");
  });
  it("says Income for income rows", () => {
    expect(transactionLabel({ ...base, kind: "income", visible })).toContain(
      "Income",
    );
  });
  it("adds the pending marker when pending", () => {
    expect(transactionLabel({ ...base, visible, pending: true })).toContain(
      "pending sync",
    );
  });
  it("handles a missing merchant (the category is the title)", () => {
    const label = transactionLabel({
      ...base,
      visible: ["Groceries", "Groceries", "−€32.15"],
    });
    expect(label.startsWith("Groceries Groceries −€32.15, Expense")).toBe(true);
  });
});
