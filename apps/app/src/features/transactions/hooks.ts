import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { api, type TransactionListParams } from "@/lib/api";
import { queryKeys } from "@/lib/query/queryClient";
import type { TransactionOut, TransactionPage } from "@/lib/types";
import { findInPages } from "./optimistic";

export type TransactionFilters = Omit<TransactionListParams, "cursor">;

export const useTransactionsInfinite = (filters: TransactionFilters) =>
  useInfiniteQuery({
    queryKey: queryKeys.transactionList(filters),
    queryFn: ({ pageParam }) =>
      api.listTransactions({ ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });

/** Finds a transaction in any cached list, with the time that list was fetched. */
export function seedFromLists(
  client: QueryClient,
  id: string,
): { data: TransactionOut; updatedAt: number } | undefined {
  for (const q of client.getQueryCache().findAll({
    queryKey: ["transactions", "list"],
  })) {
    const hit = findInPages(
      q.state.data as InfiniteData<TransactionPage> | undefined,
      id,
    );
    if (hit) return { data: hit, updatedAt: q.state.dataUpdatedAt };
  }
  return undefined;
}

/** One transaction, seeded from the cached lists so the edit screen opens instantly (and offline). */
export const useTransaction = (id: string) => {
  const client = useQueryClient();
  return useQuery({
    queryKey: queryKeys.transaction(id),
    queryFn: () => api.getTransaction(id),
    initialData: () => seedFromLists(client, id)?.data,
    initialDataUpdatedAt: () => seedFromLists(client, id)?.updatedAt,
  });
};
