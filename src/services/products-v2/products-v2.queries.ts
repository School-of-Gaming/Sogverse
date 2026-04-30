"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import type { ProductTypeV2 } from "@/types";
import {
  ProductsV2Service,
  type CreateProductV2Input,
} from "./products-v2.service";

export const productV2Keys = {
  all: ["products-v2"] as const,
  lists: () => [...productV2Keys.all, "list"] as const,
  listByType: (type: ProductTypeV2) =>
    [...productV2Keys.lists(), { type }] as const,
  visibleByType: (type: ProductTypeV2) =>
    [...productV2Keys.lists(), "visible", { type }] as const,
  detail: (id: string) => [...productV2Keys.all, "detail", id] as const,
};

export function useProductV2Detail(id: string | undefined) {
  const supabase = getClient();
  const service = new ProductsV2Service(supabase);

  return useQuery({
    queryKey: productV2Keys.detail(id ?? ""),
    queryFn: () => service.getDetailById(id!),
    enabled: !!id,
  });
}

export function useProductsV2ByType(type: ProductTypeV2) {
  const supabase = getClient();
  const service = new ProductsV2Service(supabase);

  return useQuery({
    queryKey: productV2Keys.listByType(type),
    queryFn: () => service.listByType(type),
  });
}

export function useVisibleProductsV2ByType(type: ProductTypeV2) {
  const supabase = getClient();
  const service = new ProductsV2Service(supabase);

  return useQuery({
    queryKey: productV2Keys.visibleByType(type),
    queryFn: () => service.listVisibleByType(type),
  });
}

export function useCreateProductV2() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new ProductsV2Service(supabase);

  return useMutation({
    mutationFn: (input: CreateProductV2Input) => service.createProduct(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productV2Keys.lists() });
    },
  });
}
