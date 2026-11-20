import type { TransactionOut } from "@/lib/types";

export function groupByDate(
  items: TransactionOut[],
): { title: string; data: TransactionOut[] }[] {
  const groups = new Map<string, TransactionOut[]>();
  for (const item of items) {
    const day = groups.get(item.occurred_on);
    if (day) day.push(item);
    else groups.set(item.occurred_on, [item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([title, data]) => ({ title, data }));
}
