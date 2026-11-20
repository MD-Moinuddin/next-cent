import type { TransactionOut } from "@/lib/types";
import { groupByDate } from "./group";

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
