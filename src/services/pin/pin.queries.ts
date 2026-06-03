"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { PinService } from "./pin.service";

export const pinKeys = {
  all: ["pin"] as const,
  isSet: () => [...pinKeys.all, "isSet"] as const,
  status: () => [...pinKeys.all, "status"] as const,
};

// Two queries, both surfacing an `isSet` bit — kept separate ON PURPOSE because
// they answer different questions with different mechanisms:
//
//   usePinIsSet  — "does a PIN exist?" Cheap: the unlock PAGE can resolve it
//                  server-side and seed it as initialData, so the gate paints
//                  its final shape on the first frame with no fetch.
//   usePinStatus — "...and is THIS session unlocked?" The unlock bit lives in an
//                  HttpOnly cookie, so this can only be answered by a server
//                  round-trip — it can never be SSR-seeded or read in the browser.
//
// They are NOT consolidated into one query because collapsing them would force
// the unlock page (high-frequency, latency-sensitive, currently zero-fetch) to
// pay for the heavier round-trip just to learn `isSet`. The duplicated `isSet`
// is safe from drift because the two hooks never share a page lifetime:
// usePinIsSet runs only on /parent/unlock, usePinStatus only in the Add Gamer
// dialog on /select-profile, and you can't get from one to the other without a
// full-page navigation (the unlock cookie only takes effect via such a nav),
// which wipes the React Query cache. If a future change ever mounts both on the
// same page, that invariant breaks — seed/invalidate both keys together then.

/**
 * Whether the current parent account has a PIN configured. Drives the unlock
 * gate's create-vs-enter branch. The PIN writes trigger full-page navigation
 * (the session lock state lives in a cookie the proxy reads), so they're called
 * on the service directly rather than via mutation hooks — there's no in-page
 * cache to invalidate.
 *
 * `initialData` is the server-prefetched value (the unlock page resolves
 * `pin_is_set` server-side). Seeding it means the gate renders its final shape
 * on the first frame — no loading skeleton — and the query only ever refetches
 * client-side in the rare case the server prefetch came back undefined.
 *
 * Sibling of `usePinStatus` — see the note above on why both exist and can't drift.
 */
export function usePinIsSet(initialData?: boolean) {
  return useQuery({
    queryKey: pinKeys.isSet(),
    queryFn: () => new PinService(getClient()).isSet(),
    initialData,
  });
}

/**
 * The current PIN state — `{ isSet, unlocked }`. Gates UI that must only act on
 * an unlocked parent session (the Add Gamer dialog reads this to decide whether
 * to show the create/enter pad before the form). `unlocked` lives in an HttpOnly
 * cookie, so this always goes to the server route — there's no browser-readable
 * source of truth. On a successful in-place unlock, the caller seeds the cache
 * (`setQueryData(pinKeys.status(), …)`) so reopening doesn't re-prompt.
 *
 * Superset of `usePinIsSet` (it also carries `isSet`) but deliberately a
 * separate query — see the note above on why both exist and can't drift.
 */
export function usePinStatus() {
  return useQuery({
    queryKey: pinKeys.status(),
    queryFn: () => new PinService(getClient()).status(),
  });
}
