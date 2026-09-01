"use client";

import { useQuery } from "@tanstack/react-query";
import { FamilyService, type FamilyMember } from "./family.service";

export const familyKeys = {
  all: ["family"] as const,
  list: () => [...familyKeys.all, "list"] as const,
};

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
 */
export function useFamily(options?: {
  initialData?: FamilyMember[];
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: familyKeys.list(),
    queryFn: () => new FamilyService().getFamily(),
    initialData: options?.initialData,
    enabled: options?.enabled,
  });
}
