"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { GroupsService, type BatchGroupChanges } from "./groups.service";

export const groupsKeys = {
  all: ["groups"] as const,
  byProduct: (productId: string) =>
    [...groupsKeys.all, "product", productId] as const,
};

export function useProductGroups(productId: string) {
  const supabase = getClient();
  const service = new GroupsService(supabase);

  return useQuery({
    queryKey: groupsKeys.byProduct(productId),
    queryFn: () => service.getProductGroups(productId),
    enabled: !!productId,
  });
}

export function useApplyGroupChanges(productId: string) {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GroupsService(supabase);

  return useMutation({
    mutationFn: (batch: BatchGroupChanges) =>
      service.applyChanges(productId, batch),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: groupsKeys.byProduct(productId),
      });
    },
  });
}

/**
 * Admin comp-enrollment mutation — drops a gamer directly into a product
 * (status='active', group_id=NULL). Invalidates the product's groups
 * snapshot so the new chip appears in the Unassigned card immediately.
 */
export function useAdminAddGamerToProduct(productId: string) {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GroupsService(supabase);

  return useMutation({
    mutationFn: (gamerId: string) =>
      service.addGamerToProduct(productId, gamerId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: groupsKeys.byProduct(productId),
      });
    },
  });
}
