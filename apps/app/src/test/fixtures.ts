import type { CategoryOut, MeOut, TransactionOut } from "@/lib/types";

export const me = {
  id: "u1",
  created_at: "2026-11-01T00:00:00Z",
  home_currency: "EUR",
  monthly_income_minor: 240000,
  onboarding_completed: true,
  opening_balance_minor: 100000,
} as MeOut;

export const cat = (id: string, name: string, over = {}): CategoryOut =>
  ({
    id,
    name,
    icon: "x",
    color: null,
    archived_at: null,
    ...over,
  }) as CategoryOut;

// RFC 4122 v4 shaped ids (the form schema requires a uuid for categoryId).
export const CAT = {
  dining: "3f1b1a0e-6d1c-4c58-8c0e-0d7f5d5f4b01",
  groceries: "3f1b1a0e-6d1c-4c58-8c0e-0d7f5d5f4b02",
  transport: "3f1b1a0e-6d1c-4c58-8c0e-0d7f5d5f4b03",
} as const;

export const categories = [
  cat(CAT.dining, "Dining"),
  cat(CAT.groceries, "Groceries"),
  cat(CAT.transport, "Transport"),
];

export const tx = (over: Partial<TransactionOut> = {}): TransactionOut => ({
  id: "t1",
  amount_minor: 3215,
  category_id: CAT.groceries,
  created_at: "2026-11-17T10:00:00Z",
  currency: "EUR",
  deleted_at: null,
  kind: "expense",
  merchant: "Lidl",
  note: null,
  occurred_on: "2026-11-17",
  recurring_id: null,
  tags: [],
  updated_at: "2026-11-17T10:00:00Z",
  version: 3,
  ...over,
});
