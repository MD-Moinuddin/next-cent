import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query/queryClient";
import type { CategoryIn, CategoryPatch } from "@/lib/types";

export const useCategories = (includeArchived = false) =>
  useQuery({
    queryKey: queryKeys.categories(includeArchived),
    queryFn: () => api.listCategories(includeArchived),
  });

/** Both keys (with and without archived) plus summaries, which show category names. */
function useInvalidateCategories() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["categories"] }),
      client.invalidateQueries({ queryKey: ["summary"] }),
    ]);
}

// Online-only (networkMode "always"): fail fast offline instead of queueing a rename or archive.
export function useCreateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: (body: CategoryIn) => api.createCategory(body),
    networkMode: "always",
    onSuccess: invalidate,
  });
}

export function usePatchCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CategoryPatch }) =>
      api.patchCategory(id, body),
    networkMode: "always",
    onSuccess: invalidate,
  });
}
