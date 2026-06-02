"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { PinService } from "./pin.service";

export const pinKeys = {
  all: ["pin"] as const,
  isSet: () => [...pinKeys.all, "isSet"] as const,
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
