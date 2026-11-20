import type { InfiniteData } from "@tanstack/react-query";
import type { TransactionOut, TransactionPage } from "@/lib/types";
import {
  applyUpsertToList,
  buildOptimistic,
  findInPages,
  matchesListFilters,
  removeFromPages,
  upsertIntoPages,
} from "./optimistic";

const tx = (
  id: string,
  occurred_on: string,
  extra: Partial<TransactionOut> = {},
): TransactionOut => ({
  id,
  kind: "expense",
  amount_minor: 100,
  currency: "EUR",
  occurred_on,
  category_id: "c1",
  merchant: null,
  note: null,
  recurring_id: null,
  tags: [],
  version: 1,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  deleted_at: null,
  ...extra,
});
const pages = (
  ...lists: TransactionOut[][]
): InfiniteData<TransactionPage> => ({
  pages: lists.map((items) => ({ items, next_cursor: null })),
  pageParams: lists.map(() => undefined),
});

it("inserts a new transaction into the first page in date order", () => {
  const out = upsertIntoPages(
    pages([tx("a", "2026-11-10"), tx("b", "2026-11-01")]),
    tx("n", "2026-11-05"),
  );
  expect(out!.pages[0]!.items.map((t) => t.id)).toEqual(["a", "n", "b"]);
});

it("breaks date ties by created_at descending", () => {
  const older = tx("old", "2026-11-05", { created_at: "2026-11-05T08:00:00Z" });
  const newer = tx("new", "2026-11-05", { created_at: "2026-11-05T09:00:00Z" });
  const out = upsertIntoPages(pages([older]), newer);
  expect(out!.pages[0]!.items.map((t) => t.id)).toEqual(["new", "old"]);
});

it("replaces an existing transaction wherever it is, without duplicating", () => {
  const out = upsertIntoPages(
    pages([tx("a", "2026-11-10")], [tx("b", "2026-11-01")]),
    tx("b", "2026-11-01", { merchant: "New" }),
  );
  const all = out!.pages.flatMap((p) => p.items);
  expect(all.map((t) => t.id)).toEqual(["a", "b"]);
  expect(all[1]!.merchant).toBe("New");
});

it("removes by id and tolerates undefined data", () => {
  expect(
    removeFromPages(
      pages([tx("a", "2026-11-10"), tx("b", "2026-11-01")]),
      "a",
    )!.pages[0]!.items.map((t) => t.id),
  ).toEqual(["b"]);
  expect(removeFromPages(undefined, "a")).toBeUndefined();
  expect(upsertIntoPages(undefined, tx("a", "2026-11-10"))).toBeUndefined();
});

it("never mutates its input", () => {
  const input = pages(
    [tx("a", "2026-11-10"), tx("b", "2026-11-01")],
    [tx("c", "2026-10-01")],
  );
  const snapshot = JSON.stringify(input);
  const frozen = structuredClone(input);
  for (const p of frozen.pages) {
    Object.freeze(p.items);
    Object.freeze(p);
  }
  Object.freeze(frozen.pages);
  Object.freeze(frozen);
  upsertIntoPages(frozen, tx("n", "2026-11-05"));
  upsertIntoPages(frozen, tx("c", "2026-10-01", { merchant: "x" }));
  removeFromPages(frozen, "a");
  expect(JSON.stringify(frozen)).toBe(snapshot);
  upsertIntoPages(input, tx("n", "2026-11-05"));
  removeFromPages(input, "a");
  expect(JSON.stringify(input)).toBe(snapshot);
});

it("builds an optimistic transaction from put variables", () => {
  const o = buildOptimistic({
    id: "x",
    body: {
      kind: "income",
      amount_minor: 500,
      currency: "EUR",
      occurred_on: "2026-11-02",
      category_id: null,
      merchant: "Pay",
      note: null,
      tags: ["a"],
      base_version: undefined,
    },
  });
  expect(o).toMatchObject({
    id: "x",
    kind: "income",
    amount_minor: 500,
    tags: ["a"],
    version: 1,
    deleted_at: null,
  });
});

it("keeps recurring_id, created_at and version of an existing transaction", () => {
  const existing = tx("x", "2026-11-02", {
    recurring_id: "r1",
    version: 3,
    created_at: "2026-10-01T00:00:00Z",
  });
  const o = buildOptimistic(
    {
      id: "x",
      body: {
        kind: "expense",
        amount_minor: 1,
        currency: "EUR",
        occurred_on: "2026-11-02",
        base_version: 3,
      },
    },
    existing,
  );
  expect(o).toMatchObject({
    recurring_id: "r1",
    version: 3,
    created_at: "2026-10-01T00:00:00Z",
    tags: [],
  });
});

it("breaks full ties by id", () => {
  const out = upsertIntoPages(
    pages([tx("a", "2026-11-05")]),
    tx("b", "2026-11-05"),
  );
  expect(out!.pages[0]!.items.map((t) => t.id)).toEqual(["b", "a"]);
});

describe("matchesListFilters", () => {
  const row = tx("x", "2026-11-10", { kind: "income", category_id: "c9" });
  it("matches when no filters or all filters agree", () => {
    expect(matchesListFilters(row, undefined)).toBe(true);
    expect(matchesListFilters(row, {})).toBe(true);
    expect(
      matchesListFilters(row, {
        kind: "income",
        category_id: "c9",
        from: "2026-11-01",
        to: "2026-11-30",
      }),
    ).toBe(true);
    expect(
      matchesListFilters(row, { from: "2026-11-10", to: "2026-11-10" }),
    ).toBe(true);
  });
  it("rejects on kind, category or date range", () => {
    expect(matchesListFilters(row, { kind: "expense" })).toBe(false);
    expect(matchesListFilters(row, { category_id: "c1" })).toBe(false);
    expect(matchesListFilters(row, { from: "2026-11-11" })).toBe(false);
    expect(matchesListFilters(row, { to: "2026-11-09" })).toBe(false);
  });
  it("never matches a text search because the match is unknown", () => {
    expect(matchesListFilters(row, { q: "pay" })).toBe(false);
    expect(matchesListFilters(row, { q: "" })).toBe(true);
  });
});

describe("applyUpsertToList", () => {
  const base = () => pages([tx("a", "2026-11-10")]);
  it("inserts only into lists whose filters match", () => {
    const n = tx("n", "2026-11-05", { kind: "income", category_id: "c2" });
    expect(
      applyUpsertToList(base(), n, { kind: "income" })!.pages[0]!.items.map(
        (t) => t.id,
      ),
    ).toEqual(["a", "n"]);
    expect(
      applyUpsertToList(base(), n, { kind: "expense" })!.pages[0]!.items.map(
        (t) => t.id,
      ),
    ).toEqual(["a"]);
    expect(
      applyUpsertToList(base(), n, { q: "x" })!.pages[0]!.items.map(
        (t) => t.id,
      ),
    ).toEqual(["a"]);
  });
  it("replaces an existing row even in a text-search list, and drops it when an edit no longer matches", () => {
    const edited = tx("a", "2026-11-10", { merchant: "Edited" });
    expect(
      findInPages(applyUpsertToList(base(), edited, { q: "x" }), "a")!.merchant,
    ).toBe("Edited");
    const moved = tx("a", "2026-11-10", { category_id: "c2" });
    expect(
      applyUpsertToList(base(), moved, { category_id: "c1" })!.pages[0]!.items,
    ).toEqual([]);
  });
  it("tolerates undefined data", () => {
    expect(
      applyUpsertToList(undefined, tx("a", "2026-11-10"), {}),
    ).toBeUndefined();
  });
});
