"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import type { GeduBadge } from "@/types";
import { GeduBadgesService, type HeldGeduBadge } from "./gedu-badges.service";

/**
 * A root of its own rather than a branch of the gedu-profiles key: badges live
 * in their own table, so a certify refetching them, or a badge toggle
 * refetching certification, would describe a relationship the data does not
 * have.
 */
export const geduBadgeKeys = {
  all: ["gedu-badges"] as const,
  byGedu: (geduId: string) => [...geduBadgeKeys.all, "by-gedu", geduId] as const,
};

/** The badges one gedu holds. Seed `initialData` from a server fetch. */
export function useGeduBadges(
  geduId: string,
  options?: { initialData?: HeldGeduBadge[] },
) {
  const supabase = getClient();
  const service = new GeduBadgesService(supabase);

  return useQuery({
    queryKey: geduBadgeKeys.byGedu(geduId),
    queryFn: () => service.getForGedu(geduId),
    initialData: options?.initialData,
  });
}

/**
 * Grant or revoke one badge for one gedu.
 *
 * **The invalidation is returned, not fired and forgotten**, so `mutateAsync`
 * settles only once the gedu's badges have been refetched — dropped, a toggle
 * re-enables still showing the value it just replaced.
 */
export function useSetGeduBadge() {
  const queryClient = useQueryClient();
  const supabase = getClient();
  const service = new GeduBadgesService(supabase);

  return useMutation({
    mutationFn: ({
      geduId,
      badge,
      held,
    }: {
      geduId: string;
      badge: GeduBadge;
      held: boolean;
    }) => service.setBadge(geduId, badge, held),
    onSuccess: (_data, { geduId }) =>
      queryClient.invalidateQueries({ queryKey: geduBadgeKeys.byGedu(geduId) }),
  });
}
