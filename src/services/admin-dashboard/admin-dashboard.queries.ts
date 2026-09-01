"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { adminDashboardKeys } from "./admin-dashboard.keys";
import type { AdminDashboardSnapshot } from "./admin-dashboard.contracts";
import { AdminDashboardService } from "./admin-dashboard.service";

/**
 * The whole admin dashboard in one read, **seeded from the server render**.
 *
 * It is a perceptibly slow call by construction — four platform-wide
 * aggregates, one of them counting participations and groups across every live
 * product — and the answer to a slow call the page cannot render without is not
 * a better skeleton, it is to have made the call already. The route awaits it
 * server-side and hands the document in here, so the first paint is the finished
 * dashboard and there is no loading state on this page at all.
 *
 * **The seed reaches the cache through the route's `HydrationBoundary`, not
 * through `initialData`, and the difference is a whole second aggregate.**
 * `initialData` is consulted only when the key holds nothing: it seeds a cold
 * cache and is ignored by every later mount. So a soft navigation back to
 * `/admin` — where the route has just run the RPC again — would throw that
 * answer away, render whatever the cache still held, and (the entry being
 * older than the 60-second `staleTime` by then) immediately refetch the same
 * platform-wide aggregate the server had already finished. Hydration writes the
 * incoming snapshot into the entry instead, and does it by recency rather than
 * on every render, so a refetch that landed after the server's read is never
 * overwritten by a replayed RSC payload.
 *
 * `initialData` stays, and is **required**, for what it is actually good at:
 * making `data` non-optional. That is what lets the shell have no loading branch
 * as a compile-time fact rather than an assumption — and it is honest, because a
 * caller with nothing to seed has no business rendering this page. There is
 * deliberately no `initialDataUpdatedAt`: the seed is an answer fetched moments
 * ago, never a stand-in for one, so the default `staleTime` applies to it
 * exactly as it would to a client fetch.
 *
 * React Query stays the owner from there: this is the same key the certify
 * action invalidates, so the write's refetch lands here and re-renders the page.
 *
 * **`enabled` is here for sequencing, not for gating on data.** The seed makes
 * this query renderable from the first frame whatever `enabled` says, so a
 * caller passing `false` is never withholding a page — it is holding back the
 * *fetch* until something that would change the answer has finished. Pass it
 * `false` only for a condition that resolves on its own, on mount, and only
 * once: a query left disabled is a query that stops following its own key.
 */
export function useAdminDashboard(
  initialData: AdminDashboardSnapshot,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const supabase = getClient();
  const service = new AdminDashboardService(supabase);

  return useQuery({
    queryKey: adminDashboardKeys.snapshot(),
    queryFn: () => service.getDashboard(),
    initialData,
    enabled,
  });
}
