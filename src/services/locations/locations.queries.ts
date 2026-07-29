"use client";

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import {
  LocationsService,
  type LocationCodeRef,
  type LocationWithChain,
} from "./locations.service";
import type { Location, LocationInsert } from "@/types";

/**
 * A cache key has to be a value, and the key-set lookups below take a *set*:
 * the same ids in a different order are the same query. Normalizing to a sorted
 * joined string makes that literally true, so two callers holding the same
 * selection share one cache entry instead of racing two identical fetches.
 */
function keySet(values: readonly string[]): string {
  return [...new Set(values)].sort().join(",");
}

export const locationKeys = {
  all: ["locations"] as const,
  details: () => [...locationKeys.all, "detail"] as const,
  detail: (id: string) => [...locationKeys.details(), id] as const,
  municipalities: () => [...locationKeys.all, "municipalities"] as const,
  municipalitiesByCountry: (countryCode: string) =>
    [...locationKeys.municipalities(), countryCode] as const,
  // `sites()` is the parent of `sitesByParent`, so invalidating it after a site
  // is created refreshes both the flat list and every per-municipality view.
  sites: () => [...locationKeys.all, "sites"] as const,
  sitesByParent: (parentId: string) =>
    [...locationKeys.sites(), "by-parent", parentId] as const,
  byIds: (ids: readonly string[]) =>
    [...locationKeys.all, "by-ids", keySet(ids)] as const,
  byCodes: (countryCode: string, refs: readonly LocationCodeRef[]) =>
    [
      ...locationKeys.all,
      "by-codes",
      countryCode,
      keySet(refs.map((ref) => `${ref.type}:${ref.external_code}`)),
    ] as const,
};

export function useLocation(id: string) {
  const supabase = getClient();
  const service = new LocationsService(supabase);

  return useQuery({
    queryKey: locationKeys.detail(id),
    queryFn: () => service.getLocation(id),
    enabled: !!id,
  });
}

/** Every municipality of one country — the /schools list, the FI club picker. */
export function useMunicipalitiesByCountry(
  countryCode: string,
  options?: { initialData?: LocationWithChain[] },
) {
  const supabase = getClient();
  const service = new LocationsService(supabase);

  return useQuery({
    queryKey: locationKeys.municipalitiesByCountry(countryCode),
    queryFn: () => service.getMunicipalitiesByCountry(countryCode),
    enabled: !!countryCode,
    initialData: options?.initialData,
  });
}

/** Every site with its ancestor chain, for a grouped venue list. */
export function useSites() {
  const supabase = getClient();
  const service = new LocationsService(supabase);

  return useQuery({
    queryKey: locationKeys.sites(),
    queryFn: () => service.getSites(),
  });
}

/**
 * The sites under one municipality. `parentId` is nullable so a caller can
 * mount the hook before the user has drilled down to a place.
 */
export function useSitesByParent(parentId: string | null | undefined) {
  const supabase = getClient();
  const service = new LocationsService(supabase);

  return useQuery({
    queryKey: locationKeys.sitesByParent(parentId ?? ""),
    queryFn: () => service.getSitesByParent(parentId ?? ""),
    enabled: !!parentId,
  });
}

/** Specific rows by id — coverage chips, a stored selection's display name. */
export function useLocationsByIds(ids: readonly string[]) {
  const supabase = getClient();
  const service = new LocationsService(supabase);

  return useQuery({
    queryKey: locationKeys.byIds(ids),
    queryFn: () => service.getLocationsByIds(ids),
  });
}

/**
 * Catalog entries → rows, on demand. What a code-only UI calls to get the ids
 * it needs to write a foreign key.
 *
 * Imperative rather than declarative: a save path only learns which codes it
 * needs at the moment the user commits, which is too late for a mounted query.
 * Returns a stable function that reads through the `locationKeys.byCodes`
 * cache entry.
 */
export function useResolveLocationsByCodes() {
  const queryClient = useQueryClient();

  return useCallback(
    (countryCode: string, refs: readonly LocationCodeRef[]) => {
      // `getClient()` is the browser singleton, so building the service here
      // rather than at render time costs nothing and keeps the callback stable.
      const service = new LocationsService(getClient());
      return queryClient.fetchQuery({
        queryKey: locationKeys.byCodes(countryCode, refs),
        queryFn: () => service.resolveLocationsByCodes(countryCode, refs),
        // A commit asks the server, every time. The default one-minute
        // staleness is right for a screen that re-renders; it is wrong here,
        // where the interesting answer is "no row for this code" and a retry
        // must be able to see that change rather than replay the cached miss.
        staleTime: 0,
      });
    },
    [queryClient],
  );
}

export function useCreateLocation() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new LocationsService(supabase);

  return useMutation({
    mutationFn: (location: LocationInsert) => service.createLocation(location),
    onSuccess: () => {
      // The only thing this route creates is a site, and a new site changes
      // both the flat list and the per-municipality one.
      //
      // RETURNED, not fired-and-forgotten: React Query awaits a promise
      // returned from onSuccess before resolving mutateAsync. The site picker
      // auto-selects the created id the moment the dialog closes, and it also
      // clears any selected id that is not in useSites() — so if mutateAsync
      // resolved while the sites cache was still the pre-create array, the
      // picker would select the new venue and immediately wipe it.
      return queryClient.invalidateQueries({ queryKey: locationKeys.sites() });
    },
  });
}

export function useUpdateLocation() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new LocationsService(supabase);

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Pick<Location, "name"> }) =>
      service.updateLocation(id, updates),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: locationKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: locationKeys.municipalities() });
      queryClient.invalidateQueries({ queryKey: locationKeys.sites() });
    },
  });
}
