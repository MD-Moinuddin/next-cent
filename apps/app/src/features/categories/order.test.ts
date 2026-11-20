import type { CategoryOut, TransactionOut } from "@/lib/types";
import { orderByUsage } from "./order";

const cat = (id: string, name: string) =>
  ({ id, name, icon: "x", color: null, archived_at: null }) as CategoryOut;
const tx = (category_id: string) => ({ category_id }) as TransactionOut;

it("orders by usage count then name and keeps unused categories", () => {
  const cats = [
    cat("1", "Dining"),
    cat("2", "Groceries"),
    cat("3", "Transport"),
  ];
  const ordered = orderByUsage(cats, [tx("2"), tx("2"), tx("3")]);
  expect(ordered.map((c) => c.name)).toEqual([
    "Groceries",
    "Transport",
    "Dining",
  ]);
});
it("ignores archived categories", () => {
  const archived = {
    ...cat("9", "Old"),
    archived_at: "2026-01-01T00:00:00Z",
  } as CategoryOut;
  expect(orderByUsage([archived, cat("1", "A")], []).map((c) => c.id)).toEqual([
    "1",
  ]);
});
it("does not mutate its input", () => {
  const cats = Object.freeze([cat("1", "B"), cat("2", "A")]) as CategoryOut[];
  expect(orderByUsage(cats, []).map((c) => c.id)).toEqual(["2", "1"]);
});
