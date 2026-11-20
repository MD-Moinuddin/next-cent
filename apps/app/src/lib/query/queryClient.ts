import { QueryClient } from "@tanstack/react-query";
import { isRetryable } from "./errors";

export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: CACHE_MAX_AGE_MS,
        retry: (n, e) => isRetryable(e) && n < 3,
      },
      mutations: { gcTime: CACHE_MAX_AGE_MS },
    },
  });
}

export const queryClient = createQueryClient();

export const queryKeys = {
  me: ["me"] as const,
  categories: (archived: boolean) => ["categories", archived] as const,
  transactions: ["transactions"] as const,
  transactionList: (filters: object) =>
    ["transactions", "list", filters] as const,
  transaction: (id: string) => ["transactions", "detail", id] as const,
  recurring: ["recurring"] as const,
  summary: (from: string, to: string) => ["summary", from, to] as const,
};
