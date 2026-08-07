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
 */
export function useFamily(options?: { initialData?: FamilyMember[] }) {
  return useQuery({
    queryKey: familyKeys.list(),
    queryFn: () => new FamilyService().getFamily(),
    initialData: options?.initialData,
  });
}
