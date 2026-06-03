"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { PinService } from "./pin.service";

export const pinKeys = {
  all: ["pin"] as const,
  isSet: () => [...pinKeys.all, "isSet"] as const,
  status: () => [...pinKeys.all, "status"] as const,
};

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
 */
export function usePinStatus() {
  return useQuery({
    queryKey: pinKeys.status(),
    queryFn: () => new PinService(getClient()).status(),
  });
}
