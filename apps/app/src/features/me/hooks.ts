import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query/queryClient";
import type { MePatch } from "@/lib/types";

export const useMe = (enabled = true) =>
  useQuery({ queryKey: queryKeys.me, queryFn: api.getMe, enabled });

export function usePatchMe() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: MePatch) => api.patchMe(body),
    networkMode: "always", // fail fast offline instead of queueing profile changes
    onSuccess: (me) => {
      client.setQueryData(queryKeys.me, me);
      void client.invalidateQueries({ queryKey: ["summary"] });
      // Editing the monthly income changes the managed primary-income recurring rule.
      void client.invalidateQueries({ queryKey: queryKeys.recurring });
    },
  });
}
