"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { SitesService } from "./sites.service";

/**
 * A cache key has to be a value, and the tally read takes a *set*: the same
 * ids in a different order are the same query. Normalizing to a sorted joined
 * string makes that literally true, so a page and a search answering with the
 * same sites share one entry rather than racing two identical reads.
 */
function keySet(values: readonly string[]): string {
  return [...new Set(values)].sort().join(",");
}

export const siteKeys = {
  all: ["sites"] as const,
  // A grouping key with no query of its own. The site-notes write is not told
  // which site page is on screen, so it invalidates this and every notes read
  // under it refreshes.
  notes: () => [...siteKeys.all, "notes"] as const,
  notesFor: (locationId: string) => [...siteKeys.notes(), locationId] as const,
  products: () => [...siteKeys.all, "products"] as const,
  productsAt: (locationId: string) =>
    [...siteKeys.products(), locationId] as const,
  productCounts: () => [...siteKeys.all, "product-counts"] as const,
  productCountsFor: (siteIds: readonly string[]) =>
    [...siteKeys.productCounts(), keySet(siteIds)] as const,
};

/** The address and both notes for one site. */
export function useSiteNotes(locationId: string | null | undefined) {
  const supabase = getClient();
  const service = new SitesService(supabase);

  return useQuery({
    queryKey: siteKeys.notesFor(locationId ?? ""),
    queryFn: () => service.getSiteNotes(locationId ?? ""),
    enabled: !!locationId,
  });
}

/** Every product running at one site. */
export function useProductsAtSite(locationId: string | null | undefined) {
  const supabase = getClient();
  const service = new SitesService(supabase);

  return useQuery({
    queryKey: siteKeys.productsAt(locationId ?? ""),
    queryFn: () => service.getProductsAtSite(locationId ?? ""),
    enabled: !!locationId,
  });
}

/**
 * How many products sit at each of the sites currently on screen.
 *
 * The argument is whatever the table is rendering — one page of sites, or one
 * page of search hits — so the read is bounded by the screen rather than by the
 * table, and a "show more" simply asks a wider question under a new key.
 */
export function useSiteProductCounts(siteIds: readonly string[]) {
  const supabase = getClient();
  const service = new SitesService(supabase);

  return useQuery({
    queryKey: siteKeys.productCountsFor(siteIds),
    queryFn: () => service.getProductCountsBySite(siteIds),
    enabled: siteIds.length > 0,
  });
}
