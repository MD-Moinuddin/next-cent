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

/** Net amount of a day (income minus expenses), or null when the day mixes currencies. */
export function dayNet(
  items: TransactionOut[],
): { minor: number; currency: string } | null {
  const currency = items[0]?.currency;
  if (!currency || items.some((i) => i.currency !== currency)) return null;
  const minor = items.reduce(
    (sum, i) => sum + (i.kind === "income" ? i.amount_minor : -i.amount_minor),
    0,
  );
  return { minor, currency };
}
