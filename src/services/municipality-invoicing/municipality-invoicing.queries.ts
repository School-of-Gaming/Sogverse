"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
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

/**
 * Several months of municipality invoicing at once — the earlier months of a
 * billing period whose last month is on screen, which the page reads to decide
 * each quarterly or half-yearly customer's file.
 *
 * One entry per month under the same key the single-month hook uses, so a
 * month read here is the month the stepper lands on, and an invalidation of
 * `municipalityInvoicingKeys.all` refreshes these with the rest. `seeds` are
 * the documents the route already read, matched by month; a month without one
 * is fetched, and is simply absent from the answer until it lands.
 *
 * The answer is the documents in hand, and it is the same array from render to
 * render until one of them changes — the combine below is a module function,
 * so React Query re-runs it only when a result does — which is what lets the
 * page build its months in a memo keyed on it.
 */
export function useMunicipalityInvoicingMonths(
  monthStarts: readonly string[],
  seeds: readonly MunicipalityInvoicingSnapshot[],
): MunicipalityInvoicingSnapshot[] {
  const supabase = getClient();
  const service = new MunicipalityInvoicingService(supabase);

  return useQueries({
    queries: monthStarts.map((monthStart) => ({
      queryKey: municipalityInvoicingKeys.month(monthStart),
      queryFn: () => service.getMonth(monthStart),
      initialData: seeds.find((seed) => seed.month_start === monthStart),
    })),
    combine: documentsInHand,
  });
}

function documentsInHand(
  results: readonly { data: MunicipalityInvoicingSnapshot | undefined }[],
): MunicipalityInvoicingSnapshot[] {
  return results.flatMap((result) =>
    result.data === undefined ? [] : [result.data],
  );
}
