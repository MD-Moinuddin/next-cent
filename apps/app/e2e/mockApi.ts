import type {
  CategoryOut,
  MeOut,
  RecurringOut,
  SummaryOut,
  TagOut,
  TransactionIn,
  TransactionOut,
} from "@nextcent/api-client";
import type { Page, Route } from "@playwright/test";

// Minimal in-memory stand-in for the NextCent API. Response shapes are typed from the generated client,
// so contract drift is a typecheck error. Any request no handler matches is recorded and fails the test.
const API = "http://localhost:8000";
const NOW = "2026-11-18T09:00:00Z";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
};

const NAMES = [
  ["Groceries", "🛒"],
  ["Dining", "🍽️"],
  ["Transport", "🚌"],
  ["Housing", "🏠"],
  ["Utilities", "💡"],
  ["Other", "📦"],
] as const;
export const categories: CategoryOut[] = NAMES.map(([name, icon], i) => ({
  id: `00000000-0000-4000-8000-00000000000${i + 1}`,
  name,
  icon,
  color: null,
  archived_at: null,
}));

export type MockTx = TransactionOut;

export interface MockOptions {
  onboarded?: boolean;
  transactions?: MockTx[];
  recurring?: RecurringOut[];
}

export function seedTransaction(over: Partial<MockTx> = {}): MockTx {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    kind: "expense",
    amount_minor: 1250,
    currency: "EUR",
    occurred_on: "2026-11-17",
    category_id: categories[1].id,
    merchant: null,
    note: null,
    recurring_id: null,
    tags: [],
    version: 1,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    ...over,
  };
}

export function seedRecurring(over: Partial<RecurringOut> = {}): RecurringOut {
  return {
    id: "30000000-0000-4000-8000-000000000001",
    kind: "expense",
    amount_minor: 80000,
    currency: "EUR",
    category_id: categories[3].id,
    merchant: "Rent",
    cadence: "monthly",
    anchor_on: "2026-11-01",
    next_due_on: "2026-12-01",
    active: true,
    is_primary_income: false,
    ...over,
  };
}

export interface MockApi {
  transactions: () => MockTx[];
  /** "METHOD url" of every request no handler matched. */
  unmatched: () => string[];
}

export async function mockApi(
  page: Page,
  options: MockOptions = {},
): Promise<MockApi> {
  let onboarded = options.onboarded ?? true;
  const txs = new Map<string, MockTx>(
    (options.transactions ?? []).map((t) => [t.id, t]),
  );
  const unmatched: string[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      headers: CORS,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  const me = (): MeOut => ({
    id: "20000000-0000-4000-8000-000000000001",
    home_currency: "EUR",
    opening_balance_minor: 0,
    monthly_income_minor: null,
    onboarding_completed: onboarded,
    created_at: NOW,
  });
  const live = () => [...txs.values()].filter((t) => !t.deleted_at);

  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();

    if (p === "/v1/me" && (method === "GET" || method === "PATCH")) {
      if (method === "PATCH") {
        const body = req.postDataJSON() as { onboarding_completed?: boolean };
        if (body.onboarding_completed) onboarded = true;
      }
      return json(route, me());
    }
    if (p === "/v1/categories" && method === "GET")
      return json(route, categories);
    if (p === "/v1/tags" && method === "GET")
      return json(route, [] as TagOut[]);
    if (p === "/v1/recurring" && method === "GET")
      return json(route, options.recurring ?? []);
    if (p === "/v1/summary" && method === "GET") {
      const spent = live()
        .filter((t) => t.kind === "expense")
        .reduce((s, t) => s + t.amount_minor, 0);
      const summary: SummaryOut = {
        range_start: url.searchParams.get("from") ?? "2026-11-01",
        range_end: url.searchParams.get("to") ?? "2026-11-30",
        currency: "EUR",
        income_minor: 0,
        expense_minor: spent,
        net_minor: -spent,
        balance_minor: -spent,
        by_category: [],
        excluded_other_currency_count: 0,
      };
      return json(route, summary);
    }
    if (p === "/v1/transactions" && method === "GET") {
      const items = live().sort((a, b) =>
        b.occurred_on.localeCompare(a.occurred_on),
      );
      return json(route, { items, next_cursor: null });
    }
    const m = /^\/v1\/transactions\/([^/]+)(\/restore)?$/.exec(p);
    if (m) {
      const id = m[1];
      const existing = txs.get(id);
      if (m[2] && method === "POST") {
        if (!existing) return json(route, { code: "not_found" }, 404);
        existing.deleted_at = null;
        existing.version += 1;
        return json(route, existing);
      }
      if (method === "GET")
        return existing
          ? json(route, existing)
          : json(route, { code: "not_found" }, 404);
      if (method === "PUT") {
        const body = req.postDataJSON() as TransactionIn;
        const { base_version: _ignored, ...fields } = body;
        void _ignored;
        const next: MockTx = {
          ...seedTransaction({ id }),
          ...(existing ?? {}),
          ...fields,
          category_id: fields.category_id ?? null,
          merchant: fields.merchant ?? null,
          note: fields.note ?? null,
          tags: fields.tags ?? [],
          id,
          version: existing ? existing.version + 1 : 1,
          created_at: existing?.created_at ?? NOW,
          updated_at: NOW,
          deleted_at: null,
        };
        txs.set(id, next);
        return json(route, next, existing ? 200 : 201);
      }
      if (method === "DELETE") {
        if (existing) {
          existing.deleted_at = NOW;
          existing.version += 1;
        }
        return route.fulfill({ status: 204, headers: CORS });
      }
    }
    unmatched.push(`${method} ${req.url()}`);
    return json(route, { code: "not_found", title: "unmocked" }, 404);
  });
  return {
    transactions: () => [...txs.values()],
    unmatched: () => [...unmatched],
  };
}

/** Marks the stub session as signed in before the app boots. */
export async function signedIn(page: Page) {
  await page.addInitScript(() =>
    localStorage.setItem("nextcent-e2e-signed-in", "1"),
  );
}
