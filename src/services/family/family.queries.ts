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
 * The route always names the session's provenance, but a server component
 * seeding this cache has only the member list — the shape of the seed is what
 * makes `session_provenance` nullable here and not on the wire. `null` therefore
 * means "not known yet", which is exactly what a consumer gating on it should
 * wait for rather than guess at.
 */
type CachedFamily = {
  family: FamilyMember[];
  session_provenance: SessionProvenance | null;
};

function familyQueryOptions(enabled: boolean | undefined, initialData?: FamilyMember[]) {
  return {
    queryKey: familyKeys.list(),
    queryFn: async (): Promise<CachedFamily> =>
      (await new FamilyService().getFamily()) satisfies FamilyListResponse,
    initialData: initialData
      ? ({ family: initialData, session_provenance: null } as CachedFamily)
      : undefined,
    enabled,
  };
}

/**
 * Family list for the current viewer. `initialData` lets a server component
 * seed React Query's cache so the profile selector and the parent dashboard's
 * child sections paint populated on the first frame instead of flashing
 * skeletons — the same prefetch-and-hydrate shape the participation reads use.
 * Omit it for client-only mounts (dialogs, the admin style guide). The hook
 * still refetches on mount to revalidate.
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
  initialData?: FamilyMember[];
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
 * `null` while the answer is not in yet — including the frame a server-seeded
 * family list paints, which carries members but no provenance. A switch gate
 * must wait for a value rather than assume one: assuming `family` would prompt
 * for a PIN the route will refuse, and assuming `own` would ask a child for a
 * password nobody set.
 */
export function useSessionProvenance(options?: { enabled?: boolean }) {
  return useQuery({
    ...familyQueryOptions(options?.enabled),
    select: (data: CachedFamily) => data.session_provenance,
  });
}
