"use client";

import { useQuery } from "@tanstack/react-query";
import { FamilyService } from "./family.service";
import type { FamilyMember, FamilyListResponse } from "./family.contracts";
import type { SessionProvenance } from "@/lib/session-provenance";

export const familyKeys = {
  all: ["family"] as const,
  list: () => [...familyKeys.all, "list"] as const,
};

/**
 * What the family key holds.
 *
 * The route always names the session's provenance; a server component seeding
 * this cache may or may not, which is what makes `session_provenance` nullable
 * here and not on the wire. `null` therefore means "not known yet", which is
 * exactly what a consumer gating on it should wait for rather than guess at.
 */
type CachedFamily = {
  family: FamilyMember[];
  session_provenance: SessionProvenance | null;
};

/** What a server component may hand this cache before the first fetch lands. */
export interface FamilySeed {
  family: FamilyMember[];
  /**
   * Omitted where the seeding page has no reason to derive it — the parent
   * dashboard, whose viewer is a customer and therefore never gated. A page
   * whose viewer *can* be gated has to seed this, or its first frame renders
   * with the gate undecided and every switch out of service until the refetch
   * lands. Deriving it costs no round trip: it comes off the same verified JWT
   * the page's own auth check already read.
   */
  sessionProvenance?: SessionProvenance;
}

function familyQueryOptions(enabled: boolean | undefined, seed?: FamilySeed) {
  return {
    queryKey: familyKeys.list(),
    queryFn: async (): Promise<CachedFamily> =>
      (await new FamilyService().getFamily()) satisfies FamilyListResponse,
    initialData: seed
      ? ({
          family: seed.family,
          session_provenance: seed.sessionProvenance ?? null,
        } as CachedFamily)
      : undefined,
    enabled,
  };
}

/**
 * Family list for the current viewer. `initialData` lets a server component
 * seed React Query's cache so the profile selector and the parent dashboard's
 * child sections paint populated on the first frame instead of flashing
 * skeletons — the same prefetch-and-hydrate shape the participation reads use.
 * Omit it for client-only mounts (dialogs, the admin style guide).
 *
 * **A seed is not a first guess that a refetch will correct.** The client's
 * global `staleTime` is a minute, so seeded data is fresh data: nothing
 * refetches on mount, and whatever the seed says stands until something
 * invalidates the key or the minute runs out. A page therefore seeds a value it
 * is sure of, or seeds nothing — a pessimistic seed (an empty household, an
 * unknown provenance) is pinned for the minute, not repaired by the next read.
 *
 * `enabled` exists for callers that mount on every page for every role — the
 * header's account menu — where the read has to be held back rather than
 * merely ignored: `/api/family/list` is gated to `customer` and `gamer`, so an
 * admin or gedu firing it gets a 403 per navigation and an error in the cache.
 *
 * Returns the members alone. The provenance rides in the same cache entry and is
 * read through {@link useSessionProvenance}, so a page needing both pays for one
 * request rather than two.
 */
export function useFamily(options?: {
  initialData?: FamilySeed;
  enabled?: boolean;
}) {
  return useQuery({
    ...familyQueryOptions(options?.enabled, options?.initialData),
    select: (data: CachedFamily) => data.family,
  });
}

/**
 * Where this session came from, as the family list reports it: `own` if the
 * viewer typed this account's own password, `family` if the session was handed
 * over by an account switch.
 *
 * `null` while the answer is not in yet — which now means a genuinely unseeded
 * mount, since a page that seeds the list for a viewer who can be gated seeds
 * the provenance with it. A switch gate must wait for a value rather than
 * assume one: assuming `family` would prompt for a PIN the route will refuse,
 * and assuming `own` would ask a child for a password nobody set.
 */
export function useSessionProvenance(options?: { enabled?: boolean }) {
  return useQuery({
    ...familyQueryOptions(options?.enabled),
    select: (data: CachedFamily) => data.session_provenance,
  });
}
