import type { TransactionOut } from "@/lib/types";
import { dayNet, groupByDate } from "./group";

const tx = (id: string, d: string) =>
  ({ id, occurred_on: d, created_at: `${d}T00:00:00Z` }) as TransactionOut;

it("groups by day, preserving order within and newest day first", () => {
  const groups = groupByDate([
    tx("a", "2026-11-17"),
    tx("b", "2026-11-17"),
    tx("c", "2026-11-16"),
  ]);
  expect(groups.map((g) => g.title)).toEqual(["2026-11-17", "2026-11-16"]);
  expect(groups[0]!.data.map((t) => t.id)).toEqual(["a", "b"]);
});
it("sorts days newest first even when input interleaves them", () => {
  const groups = groupByDate([
    tx("a", "2026-11-16"),
    tx("b", "2026-11-17"),
    tx("c", "2026-11-16"),
  ]);
  expect(groups.map((g) => g.title)).toEqual(["2026-11-17", "2026-11-16"]);
  expect(groups[1]!.data.map((t) => t.id)).toEqual(["a", "c"]);
});
it("returns an empty list for no items", () =>
  expect(groupByDate([])).toEqual([]));

const money = (kind: "income" | "expense", minor: number, currency = "EUR") =>
  ({ kind, amount_minor: minor, currency }) as TransactionOut;

it("nets a day: income minus expenses", () => {
  expect(
    dayNet([
      money("income", 5000),
      money("expense", 1250),
      money("expense", 250),
    ]),
  ).toEqual({ minor: 3500, currency: "EUR" });
  expect(dayNet([money("expense", 400)])).toEqual({
    minor: -400,
    currency: "EUR",
  });
});
it("has no day total for an empty day or mixed currencies", () => {
  expect(dayNet([])).toBeNull();
  expect(dayNet([money("expense", 1), money("expense", 1, "USD")])).toBeNull();
});
