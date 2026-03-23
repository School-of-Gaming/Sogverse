"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { GroupsService } from "./groups.service";

export const groupKeys = {
  all: ["groups"] as const,
  byProduct: (productId: string) => [...groupKeys.all, "product", productId] as const,
  mine: () => [...groupKeys.all, "mine"] as const,
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

export function useMyGroups() {
  const supabase = getClient();
  const service = new GroupsService(supabase);

  return useQuery({
    queryKey: groupKeys.mine(),
    queryFn: () => service.getMyGroups(),
  });
}
