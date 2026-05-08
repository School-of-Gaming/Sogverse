"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { GroupsV2Service, type BatchGroupChangesV2 } from "./groups-v2.service";

export const groupsV2Keys = {
  all: ["groups-v2"] as const,
  byProduct: (productId: string) =>
    [...groupsV2Keys.all, "product", productId] as const,
};

export function useProductGroupsV2(productId: string) {
  const supabase = getClient();
  const service = new GroupsV2Service(supabase);

  return useQuery({
    queryKey: groupsV2Keys.byProduct(productId),
    queryFn: () => service.getProductGroups(productId),
    enabled: !!productId,
  });
}

export function useApplyGroupChangesV2(productId: string) {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GroupsV2Service(supabase);

  return useMutation({
    mutationFn: (batch: BatchGroupChangesV2) =>
      service.applyChanges(productId, batch),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: groupsV2Keys.byProduct(productId),
      });
    },
  });
}
