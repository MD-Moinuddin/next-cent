// The only file (with api.ts) that names generated types. Adjust here if the contract renames them.
export type {
  MeOut,
  MePatch,
  CategoryOut,
  CategoryIn,
  CategoryPatch,
  TransactionIn,
  TransactionOut,
  RecurringIn,
  RecurringOut,
  RecurringPatch,
  SummaryOut,
  PageTransactionOut as TransactionPage,
} from "@nextcent/api-client";

export interface Problem {
  code?: string;
  title?: string;
  detail?: string;
  current_version?: number;
}
