"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { adminDashboardKeys } from "@/services/admin-dashboard/admin-dashboard.keys";
import { catalogueImageUsageKey } from "@/services/catalogue-images/catalogue-images.keys";
import { municipalityInvoicingKeys } from "@/services/municipality-invoicing";
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
  plannedSessions: (id: string | undefined) =>
    [...productKeys.all, "planned-sessions", id] as const,
  plannedSessionsIn: (id: string | undefined, from: string, to: string) =>
    [...productKeys.plannedSessions(id), { from, to }] as const,
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

// `enabled` defaults to true, so every existing caller is unchanged. It exists
// for the callers that are mounted long before they are looked at — an overlay
// that stays in the tree so it can animate — where the whole catalogue of a type
// would otherwise be read on every page that happens to hold one.
export function useProductsByType(
  type: ProductType,
  options?: { enabled?: boolean },
) {
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useQuery({
    queryKey: productKeys.listByType(type),
    queryFn: () => service.listByType(type),
    enabled: options?.enabled ?? true,
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

/**
 * A product's planned sessions in `[from, to]`, or nothing while any of the
 * three is unknown — the caller usually learns the window from the product
 * read.
 *
 * A window that moves (an open-ended product's reaches a year past today, so it
 * moves at midnight) keeps the previous window's sessions on screen while the
 * new one is read, so the query is pending only before its first answer — the
 * admin product page waits on exactly that, and must not fall back to its
 * loading state at midnight.
 */
export function usePlannedSessions(
  productId: string | undefined,
  window: { from: string; to: string } | null,
) {
  const supabase = getClient();
  const service = new ProductsService(supabase);

  return useQuery({
    queryKey: productKeys.plannedSessionsIn(
      productId,
      window?.from ?? "",
      window?.to ?? "",
    ),
    queryFn: () =>
      service.getPlannedSessions(productId!, window!.from, window!.to),
    enabled: !!productId && window !== null,
    placeholderData: keepPreviousData,
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
      // A municipality club's fee, customer, term and schedule are all read by
      // the invoicing ledger, so a cached month is stale the moment one is saved.
      queryClient.invalidateQueries({ queryKey: municipalityInvoicingKeys.all });
      // The image catalogue's usage map is read from the products' pictures.
      queryClient.invalidateQueries({ queryKey: catalogueImageUsageKey });
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
      // The term and the slots are the plan, so a saved edit moves its dates.
      queryClient.invalidateQueries({
        queryKey: productKeys.plannedSessions(id),
      });
      queryClient.invalidateQueries({ queryKey: adminDashboardKeys.all });
      queryClient.invalidateQueries({ queryKey: municipalityInvoicingKeys.all });
      queryClient.invalidateQueries({ queryKey: catalogueImageUsageKey });
    },
  });
}
