"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { GroupsService, type BatchGroupChanges } from "./groups.service";

const groupKeys = {
  all: ["groups"] as const,
  byProduct: (productId: string) => [...groupKeys.all, "product", productId] as const,
};

export function useProductGroups(productId: string) {
  const supabase = getClient();
  const service = new GroupsService(supabase);

  return useQuery({
    queryKey: groupKeys.byProduct(productId),
    queryFn: () => service.getProductGroups(productId),
    enabled: !!productId,
  });
}

export function useCommitGroupChanges(productId: string) {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GroupsService(supabase);

  return useMutation({
    mutationFn: (changes: BatchGroupChanges) =>
      service.commitGroupChanges(productId, changes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: groupKeys.byProduct(productId) });
    },
  });
}
