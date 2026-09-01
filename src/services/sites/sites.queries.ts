"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { SitesService } from "./sites.service";

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
  // The tally over every site, and a key with no id list in it — see the hook
  // below for why the set is not part of the key.
  productCounts: () => [...siteKeys.all, "product-counts"] as const,
};

/**
 * The address and both notes for one site.
 *
 * `retry` is left at React Query's default and named by a caller that cannot
 * afford it — the same shape the location search and key-set hooks take. How
 * long a failure may take is a property of what the call site renders while it
 * waits, so the call site decides it.
 */
export function useSiteNotes(
  locationId: string | null | undefined,
  options?: { retry?: number | boolean },
) {
  const supabase = getClient();
  const service = new SitesService(supabase);

  return useQuery({
    queryKey: siteKeys.notesFor(locationId ?? ""),
    queryFn: () => service.getSiteNotes(locationId ?? ""),
    enabled: !!locationId,
    retry: options?.retry,
  });
}

/** Every product running at one site. `retry` as above. */
export function useProductsAtSite(
  locationId: string | null | undefined,
  options?: { retry?: number | boolean },
) {
  const supabase = getClient();
  const service = new SitesService(supabase);

  return useQuery({
    queryKey: siteKeys.productsAt(locationId ?? ""),
    queryFn: () => service.getProductsAtSite(locationId ?? ""),
    enabled: !!locationId,
    retry: options?.retry,
  });
}

/**
 * How many products sit at each site — the whole tally, in one entry.
 *
 * **The id list is an argument and not part of the key, deliberately.** There is
 * one caller and it holds *every* site, so there is one tally to cache and the
 * ids are a restatement of it rather than a variable. Keying on them instead
 * would put a fresh key under the table every time the set changed and blank the
 * column while the new entry loaded — a number vanishing and returning on
 * data's own schedule, in a column beside rows that did not move.
 *
 * What that costs is stated rather than hidden: a set that grows under a live
 * cache is not refetched, so a site created while this table is mounted would
 * show an empty count. It cannot happen from here — creating a site on this page
 * navigates to that site — and any later arrival is one blank cell until the
 * entry goes stale, never a wrong number.
 */
export function useSiteProductCounts(siteIds: readonly string[]) {
  const supabase = getClient();
  const service = new SitesService(supabase);

  return useQuery({
    queryKey: siteKeys.productCounts(),
    queryFn: () => service.getProductCountsBySite(siteIds),
    enabled: siteIds.length > 0,
  });
}
