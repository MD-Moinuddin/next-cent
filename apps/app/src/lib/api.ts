import {
  configureApiClient,
  createCategory,
  createRecurring,
  deleteMe,
  deleteTransaction,
  getMe,
  getSummary,
  getTransaction,
  listCategories,
  listRecurring,
  listTransactions,
  patchCategory,
  patchMe,
  patchRecurring,
  putTransaction,
  restoreTransaction,
} from "@nextcent/api-client";
import { config } from "./config";
import { unwrap } from "./query/errors";
import type {
  CategoryIn,
  CategoryPatch,
  MePatch,
  RecurringIn,
  RecurringPatch,
  TransactionIn,
} from "./types";

let tokenGetter: (() => Promise<string | null>) | null = null;
export const setTokenGetter = (fn: (() => Promise<string | null>) | null) => {
  tokenGetter = fn;
};
/** Current bearer token for raw requests (CSV download) that bypass the generated client. */
export const getAuthToken = async (): Promise<string | null> =>
  tokenGetter ? tokenGetter() : null;
configureApiClient({
  baseUrl: config.apiUrl,
  getToken: async () => (tokenGetter ? tokenGetter() : null),
});

export interface TransactionListParams {
  from?: string;
  to?: string;
  category_id?: string;
  kind?: "expense" | "income";
  q?: string;
  cursor?: string;
  limit?: number;
}

/** Single adaptation point to the generated SDK. Each call returns data or throws ApiError/NetworkError. */
export const api = {
  getMe: () => unwrap(getMe()),
  patchMe: (body: MePatch) => unwrap(patchMe({ body })),
  deleteMe: () => unwrap(deleteMe()),
  listCategories: (includeArchived = false) =>
    unwrap(listCategories({ query: { include_archived: includeArchived } })),
  createCategory: (body: CategoryIn) => unwrap(createCategory({ body })),
  patchCategory: (id: string, body: CategoryPatch) =>
    unwrap(patchCategory({ path: { category_id: id }, body })),
  putTransaction: (id: string, body: TransactionIn) =>
    unwrap(putTransaction({ path: { tx_id: id }, body })),
  deleteTransaction: (id: string) =>
    unwrap(deleteTransaction({ path: { tx_id: id } })),
  restoreTransaction: (id: string) =>
    unwrap(restoreTransaction({ path: { tx_id: id } })),
  listTransactions: (p: TransactionListParams) =>
    unwrap(listTransactions({ query: { ...p } })),
  getTransaction: (id: string) =>
    unwrap(getTransaction({ path: { tx_id: id } })),
  listRecurring: () => unwrap(listRecurring()),
  createRecurring: (body: RecurringIn) => unwrap(createRecurring({ body })),
  patchRecurring: (id: string, body: RecurringPatch) =>
    unwrap(patchRecurring({ path: { rule_id: id }, body })),
  getSummary: (from: string, to: string) =>
    unwrap(getSummary({ query: { from, to } })),
};
