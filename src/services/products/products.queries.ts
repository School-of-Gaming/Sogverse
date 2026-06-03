"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import type { ProductType } from "@/types";
import {
  ProductsService,
  type CreateProductInput,
  type UpdateProductInput,
} from "./products.service";

export const productKeys = {
  all: ["products"] as const,
  lists: () => [...productKeys.all, "list"] as const,
  listByType: (type: ProductType) =>
    [...productKeys.lists(), { type }] as const,
  // Sort the types so the key is order-independent — callers passing the same
  // set in a different order hit the same cache entry (matches countsByProducts
  // in participations.queries.ts).
  visibleByTypes: (types: ProductType[]) =>
    [...productKeys.lists(), "visible", { types: [...types].sort() }] as const,
  detail: (id: string | undefined) =>
    [...productKeys.all, "detail", id] as const,
  adminDetail: (id: string | undefined) =>
    [...productKeys.all, "admin-detail", id] as const,
};

export function useProductDetail(id: string | undefined) {
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: () => service.getDetailById(id!),
    enabled: !!id,
  });
}

export function useProductsByType(type: ProductType) {
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useQuery({
    queryKey: productKeys.listByType(type),
    queryFn: () => service.listByType(type),
  });
}

// Visible products across one or more types in a single fetch. The shop uses
// this to load every browseable type (clubs + camps) at once so the in-page
// Type filter is an instant client-side switch rather than a per-type refetch.
export function useVisibleProductsByTypes(types: ProductType[]) {
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useQuery({
    queryKey: productKeys.visibleByTypes(types),
    queryFn: () => service.listVisibleByTypes(types),
  });
}


export function useProductAdmin(id: string | undefined) {
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useQuery({
    queryKey: productKeys.adminDetail(id),
    queryFn: () => service.getByIdForAdmin(id!),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useMutation({
    mutationFn: (input: CreateProductInput) => service.createProduct(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
    },
  });
}

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useMutation({
    mutationFn: (input: UpdateProductInput) => service.updateProduct(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
      queryClient.invalidateQueries({ queryKey: productKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: productKeys.adminDetail(id) });
    },
  });
}
