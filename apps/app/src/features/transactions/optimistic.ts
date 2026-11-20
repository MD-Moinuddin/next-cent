import type { InfiniteData } from "@tanstack/react-query";
import type {
  TransactionIn,
  TransactionOut,
  TransactionPage,
} from "@/lib/types";

export interface PutVars {
  id: string;
  body: TransactionIn;
  /**
   * Set for an edit of a row this device still has queued writes for: its server version is not
   * known yet, so the replay reads the latest version first (see the put mutationFn). Never sent.
   */
  rebase?: boolean;
}

type ListData = InfiniteData<TransactionPage> | undefined;

export interface ListFilters {
  kind?: string;
  category_id?: string;
  from?: string;
  to?: string;
  q?: string;
}

const cmpDesc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);
const byNewest = (a: TransactionOut, b: TransactionOut) =>
  cmpDesc(a.occurred_on, b.occurred_on) ||
  cmpDesc(a.created_at, b.created_at) ||
  cmpDesc(a.id, b.id);

/** True when a cached list with these filters would contain the transaction. Text search (`q`) is unknown, so false. */
export function matchesListFilters(
  tx: TransactionOut,
  filters: ListFilters | undefined,
): boolean {
  if (!filters) return true;
  if (filters.q) return false;
  if (filters.kind && tx.kind !== filters.kind) return false;
  if (filters.category_id && tx.category_id !== filters.category_id)
    return false;
  if (filters.from && tx.occurred_on < filters.from) return false;
  if (filters.to && tx.occurred_on > filters.to) return false;
  return true;
}

export function findInPages(
  data: ListData,
  id: string,
): TransactionOut | undefined {
  for (const page of data?.pages ?? []) {
    const hit = page.items.find((t) => t.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Applies an optimistic upsert to one cached list: replaces the row where it exists (list order kept by
 * date), inserts it only when the list's filters match, and drops it when an edit no longer matches.
 */
export function applyUpsertToList(
  data: ListData,
  tx: TransactionOut,
  filters: ListFilters | undefined,
): ListData {
  if (!data) return data;
  if (findInPages(data, tx.id)) {
    if (filters?.q || matchesListFilters(tx, filters))
      return upsertIntoPages(data, tx);
    return removeFromPages(data, tx.id);
  }
  return matchesListFilters(tx, filters) ? upsertIntoPages(data, tx) : data;
}

export function removeFromPages(data: ListData, id: string): ListData {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((p) => ({
      ...p,
      items: p.items.filter((t) => t.id !== id),
    })),
  };
}

export function upsertIntoPages(data: ListData, tx: TransactionOut): ListData {
  const cleaned = removeFromPages(data, tx.id);
  if (!cleaned || cleaned.pages.length === 0) return cleaned;
  const [first, ...rest] = cleaned.pages;
  return {
    ...cleaned,
    pages: [
      { ...first!, items: [...first!.items, tx].sort(byNewest) },
      ...rest,
    ],
  };
}

export function buildOptimistic(
  vars: PutVars,
  existing?: TransactionOut,
): TransactionOut {
  const now = new Date().toISOString();
  const b = vars.body;
  return {
    id: vars.id,
    kind: b.kind,
    amount_minor: b.amount_minor,
    currency: b.currency,
    occurred_on: b.occurred_on,
    category_id: b.category_id ?? null,
    merchant: b.merchant ?? null,
    note: b.note ?? null,
    recurring_id: existing?.recurring_id ?? null,
    tags: b.tags ?? [],
    version: existing ? existing.version : 1,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    deleted_at: null,
  };
}
