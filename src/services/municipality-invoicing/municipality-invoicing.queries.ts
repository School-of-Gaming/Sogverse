"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { municipalityInvoicingKeys } from "./municipality-invoicing.keys";
import type { MunicipalityInvoicingSnapshot } from "./municipality-invoicing.contracts";
import { MunicipalityInvoicingService } from "./municipality-invoicing.service";

/**
 * One month of municipality invoicing, **seeded from the server render**.
 *
 * It is a perceptibly slow call by construction — a platform-wide sweep over
 * every municipality club's sessions, schedule and location chain — and the
 * answer to a slow call the page cannot render without is not a better
 * skeleton, it is to have made the call already. The route awaits it
 * server-side and hands the document in here, so the first paint is the
 * finished invoice and there is no loading state on this page at all.
 *
 * **The seed reaches the cache through the route's `HydrationBoundary`, not
 * through `initialData`.** `initialData` is consulted only when the key holds
 * nothing, so a soft navigation to a month already looked at would throw away
 * the answer the server had just fetched and render the older one. Hydration
 * writes the incoming document into the entry by recency instead.
 *
 * `initialData` stays, and is **required**, for what it is actually good at:
 * making `data` non-optional, which is what lets the shell have no loading
 * branch as a compile-time fact rather than an assumption.
 *
 * The month is part of the key, so stepping to another month is a different
 * entry rather than the same entry changing its mind — and stepping back lands
 * on a cached answer.
 */
export function useMunicipalityInvoicingMonth(
  monthStart: string,
  initialData: MunicipalityInvoicingSnapshot,
) {
  const supabase = getClient();
  const service = new MunicipalityInvoicingService(supabase);

  return useQuery({
    queryKey: municipalityInvoicingKeys.month(monthStart),
    queryFn: () => service.getMonth(monthStart),
    initialData,
  });
}
