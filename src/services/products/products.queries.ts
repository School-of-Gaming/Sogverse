"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { adminDashboardKeys } from "@/services/admin-dashboard/admin-dashboard.queries";
import type { ProductType, ProductBrowseRow } from "@/types";
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
//
// `initialData` (optional) is the server-prefetched product list from the shop
// page's Server Component (see `shop/page.tsx`). When present the grid paints
// on the first frame with no spinner; the hook still refetches on mount.
export function useVisibleProductsByTypes(
  types: ProductType[],
  options?: { initialData?: ProductBrowseRow[] },
) {
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useQuery({
    queryKey: productKeys.visibleByTypes(types),
    queryFn: () => service.listVisibleByTypes(types),
    initialData: options?.initialData,
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

// Both writers below also invalidate the admin dashboard, which is a separate
// cache entry built from these very rows: whether a product is live at all, its
// schedule and term dates, its seat cap, and whether its gedu/municipality fees
// are set — the last of which the dashboard's ops queue flags by name. Setting
// the fee the queue asked for and returning to a page that still asks for it is
// how a reader learns to stop trusting the queue. Only admins write products and
// only an admin's cache holds that entry, so this is the browser where it lands.
export function useCreateProduct() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useMutation({
    mutationFn: (input: CreateProductInput) => service.createProduct(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.lists() });
      queryClient.invalidateQueries({ queryKey: adminDashboardKeys.all });
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
      queryClient.invalidateQueries({ queryKey: adminDashboardKeys.all });
    },
  });
}
