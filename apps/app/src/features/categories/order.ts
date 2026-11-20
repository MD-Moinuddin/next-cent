import type { CategoryOut, TransactionOut } from "@/lib/types";

/** Active categories, most used first (by the given transactions), ties by name. Does not mutate. */
export function orderByUsage(
  categories: readonly CategoryOut[],
  transactions: readonly Pick<TransactionOut, "category_id">[],
): CategoryOut[] {
  const counts = new Map<string, number>();
  for (const t of transactions)
    if (t.category_id)
      counts.set(t.category_id, (counts.get(t.category_id) ?? 0) + 1);
  return categories
    .filter((c) => !c.archived_at)
    .sort(
      (a, b) =>
        (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) ||
        a.name.localeCompare(b.name),
    );
}
