import { pendingBalanceDelta, pendingIds } from "./pending";

const create = (
  id: string,
  kind: "expense" | "income",
  amount: number,
  currency = "EUR",
) => ({
  id,
  body: {
    kind,
    amount_minor: amount,
    currency,
    occurred_on: "2026-11-02",
    category_id: null,
    tags: [],
  },
});

it("adjusts the balance for queued creates in the home currency only", () => {
  const vars = [
    create("1", "income", 1000),
    create("2", "expense", 300),
    create("3", "expense", 999, "USD"),
  ];
  expect(pendingBalanceDelta(vars, new Set(), "EUR")).toBe(700);
});

it("ignores queued edits because their previous value is unknown", () => {
  const edit = {
    id: "9",
    body: { ...create("9", "expense", 500).body, base_version: 2 },
  };
  expect(pendingBalanceDelta([edit], new Set(), "EUR")).toBe(0);
});

it("collects ids of pending transactions", () => {
  expect(
    [
      ...pendingIds([create("1", "income", 1), create("2", "expense", 1)]),
    ].sort(),
  ).toEqual(["1", "2"]);
});

it("counts a create followed by a queued delete of the same id as zero", () => {
  expect(
    pendingBalanceDelta([create("1", "expense", 300)], new Set(["1"]), "EUR"),
  ).toBe(0);
});

it("counts two puts of the same id once, with the latest amount", () => {
  const edited = { id: "1", body: { ...create("1", "expense", 500).body } }; // edit of an unsynced create: no base_version
  expect(
    pendingBalanceDelta(
      [create("1", "expense", 300), edited],
      new Set(),
      "EUR",
    ),
  ).toBe(-500);
});

it("treats a null base_version as a create", () => {
  const v = {
    id: "1",
    body: { ...create("1", "income", 40).body, base_version: null },
  };
  expect(pendingBalanceDelta([v], new Set(), "EUR")).toBe(40);
});

describe("rebased edits", () => {
  const rebased = (id: string, amount: number) => ({
    ...create(id, "expense", amount),
    rebase: true,
  });

  it("counts an unsynced create edited later once, with the latest amount", () => {
    expect(
      pendingBalanceDelta(
        [create("1", "expense", 500), rebased("1", 800)],
        new Set(),
        "EUR",
      ),
    ).toBe(-800);
  });

  it("does not count an edit-after-edit of a synced row as a create", () => {
    const edit = {
      id: "9",
      body: { ...create("9", "expense", 500).body, base_version: 2 },
    };
    expect(
      pendingBalanceDelta([edit, rebased("9", 700)], new Set(), "EUR"),
    ).toBe(0);
  });

  it("does not count a lone rebased edit (its create already landed)", () => {
    expect(pendingBalanceDelta([rebased("1", 800)], new Set(), "EUR")).toBe(0);
  });
});
