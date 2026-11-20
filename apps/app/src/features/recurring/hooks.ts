import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query/queryClient";
import type { RecurringIn, RecurringPatch } from "@/lib/types";

export const useRecurring = () =>
  useQuery({ queryKey: queryKeys.recurring, queryFn: api.listRecurring });

// Online-only (networkMode "always"): fail fast offline instead of queueing rule changes.
export function useCreateRecurring() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (b: RecurringIn) => api.createRecurring(b),
    networkMode: "always",
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.recurring }),
  });
}

export function usePatchRecurring() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RecurringPatch }) =>
      api.patchRecurring(id, body),
    networkMode: "always",
    onSuccess: () =>
      client.invalidateQueries({ queryKey: queryKeys.recurring }),
  });
}
