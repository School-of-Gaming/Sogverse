"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { familyProductFeedKeys } from "./family-product-feed.keys";
import { FamilyProductFeedService } from "./family-product-feed.service";

/** React Query bindings for the family product page. */

/**
 * One enrollment's whole page, keyed by participation id.
 *
 * **A perceptibly slow call by design** — a term of session rows plus prose in
 * one document — so the surface built on it renders a structured skeleton
 * immediately rather than nothing. On a direct load of the club-page URL that
 * skeleton is never seen: the route runs this same read server-side and hydrates
 * the answer under this key, so the query is already resolved on the first
 * render. The skeleton is what a client-side navigation, a refetch or a failed
 * prefetch still gets, which is why it stays.
 *
 * **A refusal is data, not an error.** The two cases a family can legitimately
 * hit — a participation that is not theirs, and one not yet placed in a group —
 * come back as an `unavailable` result rather than a thrown query, so the page
 * renders its not-found state from a *resolved* query and a server prefetch can
 * cache that answer too. Only a real fault throws and lands in `query.error`.
 *
 * **Nothing here mutates.** A family product page is read-only, so this file has
 * no `onSuccess` invalidations of its own; what keeps the feed fresh is the key
 * hierarchy — it hangs under the participations root, so leaving a waitlist or
 * buying a seat invalidates it along with everything else about that family.
 */
export function useFamilyProductFeed(participationId: string) {
  const service = new FamilyProductFeedService(getClient());

  return useQuery({
    queryKey: familyProductFeedKeys.feed(participationId),
    queryFn: () => service.getProductFeed(participationId),
    enabled: participationId.length > 0,
  });
}
