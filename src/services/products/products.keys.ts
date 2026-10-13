import type { ProductType } from "@/types";
import type { AdminProductListFilters } from "./products.service";

/**
 * The product cache keys. In a file of their own so the shared plan-reader
 * invalidation can name them without importing the product queries, which
 * call it in turn.
 */
export const productKeys = {
  all: ["products"] as const,
  lists: () => [...productKeys.all, "list"] as const,
  listByType: (type: ProductType) =>
    [...productKeys.lists(), { type }] as const,
  /** The admin product list's pages under one set of filters. */
  adminList: (filters: AdminProductListFilters) =>
    [...productKeys.lists(), "admin", filters] as const,
  /** The admin product list's per-type counts and filter options. */
  adminListFacets: () => [...productKeys.lists(), "admin-facets"] as const,
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
