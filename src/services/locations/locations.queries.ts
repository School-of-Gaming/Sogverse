"use client";

import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { LocationsService } from "./locations.service";
import {
  LOCATION_SEARCH_LIMIT,
  LOCATION_SEARCH_MIN_QUERY,
  type CreateLocationBody,
} from "./locations.contracts";
import type { Location, LocationType } from "@/types";

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
  // A grouping key with no query of its own: `sites()` is the parent of
  // `sitesByParent`, so invalidating it after a site is created refreshes every
  // per-municipality venue list at once, whichever one the new row landed in.
  sites: () => [...locationKeys.all, "sites"] as const,
  sitesByParent: (parentId: string) =>
    [...locationKeys.sites(), "by-parent", parentId] as const,
  // Browsing is keyed by the node opened, with the root under its own key so
  // "the countries" is a cache entry like any other level.
  children: () => [...locationKeys.all, "children"] as const,
  childrenOf: (parentId: string | null) =>
    [...locationKeys.children(), parentId ?? "root"] as const,
  search: () => [...locationKeys.all, "search"] as const,
  // Every argument that changes the answer is in the key. The country
  // restriction is one of them now that the database applies it: a search
  // scoped to Finland and the same needle unscoped return different rows and a
  // different total, so sharing a cache entry would serve one picker the
  // other's answer.
  searchFor: (
    query: string,
    types: readonly LocationType[] | undefined,
    country: string | undefined,
  ) =>
    [
      ...locationKeys.search(),
      query,
      types ? [...types].sort().join(",") : "",
      country ?? "",
    ] as const,
  byIds: (ids: readonly string[]) =>
    [...locationKeys.all, "by-ids", keySet(ids)] as const,
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

/**
 * How long a browsed or searched level stays fresh. Countries, regions and
 * communes are seeded reference data that changes when a migration says so, and
 * reopening the picker should not re-fetch the top of the tree; the one thing
 * that does change under a user — a newly created venue — invalidates this key
 * explicitly from the create mutation.
 */
const REFERENCE_DATA_STALE_MS = 5 * 60 * 1000;

/**
 * One level of the tree: the children of `parentId`, or the countries when it
 * is null.
 *
 * Infinite rather than plain, because fan-out is a property of the data and not
 * of the screen: a country has tens of children and a French département has
 * hundreds, but nothing stops a future country from having thousands at one
 * level, and the payload has to stay proportional to what is rendered. Pages
 * accumulate rather than replace, so "load more" appends under rows the user is
 * already reading instead of moving them.
 *
 * `parentId` of null is a real argument, not "not ready yet" — the root of the
 * tree is what the picker opens on.
 */
export function useLocationChildren(parentId: string | null) {
  const supabase = getClient();
  const service = new LocationsService(supabase);

  return useInfiniteQuery({
    queryKey: locationKeys.childrenOf(parentId),
    queryFn: ({ pageParam }) => service.getChildren(parentId, { page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.length : undefined,
    staleTime: REFERENCE_DATA_STALE_MS,
  });
}

/**
 * Cross-country search, or one country's when the caller names it. Below the
 * minimum needle length the query never runs, which is what keeps a
 * keystroke-driven box from firing a request per letter before it could match
 * anything meaningful.
 *
 * `keepPreviousResults` is on by default and is right for a panel whose whole
 * result area is these hits: the list a user is reading is replaced rather than
 * emptied. It is wrong — and has to be turned off — wherever these hits are
 * *interleaved* with results the caller computed itself, because those update
 * on the keystroke while these lag a debounce behind: the previous needle's
 * hits would then sit under fresh local ones, reading as answers to a query
 * they do not match.
 *
 * `retry` is left at React Query's default here and named by a caller that
 * cannot afford it. Three retries with backoff is the right answer for a panel
 * that has nothing else to show and every reason to keep trying — but it is
 * roughly seven seconds, and a caller whose results area renders *nothing*
 * while this arm is unresolved would spend all of it blank before falling back
 * to its own empty state. How long a failure may take is a property of what the
 * call site does with the wait, so the call site is where it is decided.
 */
export function useLocationSearch(
  query: string,
  options?: {
    types?: readonly LocationType[];
    limit?: number;
    country?: string;
    keepPreviousResults?: boolean;
    retry?: number | boolean;
  },
) {
  const supabase = getClient();
  const service = new LocationsService(supabase);
  const needle = query.trim();
  const types = options?.types;
  const country = options?.country;
  const keepPreviousResults = options?.keepPreviousResults ?? true;

  return useQuery({
    queryKey: locationKeys.searchFor(needle, types, country),
    queryFn: () =>
      service.searchLocations(needle, {
        types,
        limit: options?.limit ?? LOCATION_SEARCH_LIMIT,
        country,
      }),
    enabled: needle.length >= LOCATION_SEARCH_MIN_QUERY,
    staleTime: REFERENCE_DATA_STALE_MS,
    // Undefined leaves React Query's own default in place, so only a caller
    // that has thought about the blank window pays a different one.
    retry: options?.retry,
    // The previous needle's hits stay on screen while the next one is in
    // flight, so a list the user is reading is replaced rather than emptied.
    placeholderData: keepPreviousResults ? (previous) => previous : undefined,
  });
}

/** Specific rows by id, each with its chain — coverage chips, a stored pick. */
export function useLocationsByIds(ids: readonly string[]) {
  const supabase = getClient();
  const service = new LocationsService(supabase);

  return useQuery({
    queryKey: locationKeys.byIds(ids),
    queryFn: () => service.getLocationsByIds(ids),
  });
}

export function useCreateLocation() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new LocationsService(supabase);

  return useMutation({
    mutationFn: (location: CreateLocationBody) => service.createLocation(location),
    onSuccess: () => {
      // The only thing this route creates is a site, and a new site changes
      // the per-municipality venue list it landed in — plus the browse level it
      // was created under, which is now one row longer.
      //
      // And every cached search needle, for the same reason a rename does:
      // sites are in the search index carrying their whole ancestor chain, so
      // an admin who names a venue and then types its name must find it. A
      // cached "no results" for that very needle is the likely one to be
      // holding, because looking before creating is how the flow goes.
      //
      // Be exact about what that last one buys, because it is less than the
      // others: it guarantees a fresh *refetch*, not a fresh *answer*. The two
      // browse keys are PostgREST reads and come back from the database, but
      // search goes through /api/locations/search, whose responses are keyed by
      // URL in a shared cache for five minutes and served stale for an hour
      // while they revalidate. So the refetch can legitimately be answered with
      // the same pre-creation response the admin already saw, and the venue
      // stays missing from that one needle until the entry ages out. Nothing on
      // this side can shorten that window: seeding the new row into the search
      // cache by hand would be this client inventing a ranked result the server
      // did not produce, which is worse than a stale one it did.
      //
      // RETURNED, not fired-and-forgotten: React Query awaits a promise
      // returned from onSuccess before resolving mutateAsync, so the venue
      // dialog cannot hand a freshly created id back to a form whose caches
      // still describe the world before it existed.
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: locationKeys.sites() }),
        queryClient.invalidateQueries({ queryKey: locationKeys.children() }),
        queryClient.invalidateQueries({ queryKey: locationKeys.search() }),
      ]);
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
      queryClient.invalidateQueries({ queryKey: locationKeys.sites() });
      queryClient.invalidateQueries({ queryKey: locationKeys.children() });
      // A rename changes what search matches, so every cached needle is stale.
      queryClient.invalidateQueries({ queryKey: locationKeys.search() });
    },
  });
}
