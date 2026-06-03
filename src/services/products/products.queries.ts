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
  visibleByTypes: (types: ProductType[]) =>
    [...productKeys.lists(), "visible", { types }] as const,
  myGeduAssigned: () =>
    [...productKeys.lists(), "my-gedu-assigned"] as const,
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

// All products the current gedu is assigned to (across types). Browse pages
// filter client-side to the type they render — one fetch covers /clubs,
// /camps, /events. `enabled` lets callers gate the query behind the
// role check so non-gedu visitors don't waste a round trip.
export function useMyGeduAssignedProducts({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useQuery({
    queryKey: productKeys.myGeduAssigned(),
    queryFn: () => service.listMyGeduAssigned(),
    enabled,
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
