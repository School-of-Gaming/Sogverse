"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import type { AdminDashboardSnapshot } from "./admin-dashboard.contracts";
import { AdminDashboardService } from "./admin-dashboard.service";

/**
 * One key, because there is one query. The hierarchy is still written out so a
 * mutation elsewhere that changes what the dashboard says can invalidate
 * `adminDashboardKeys.all` and have this read follow — and four of them do:
 * certifying a gedu (the shell that owns the action, since the gedu mutation is
 * a general one), every action in the admin group panel including waitlist
 * promote/demote (the groups feature invalidates both keys together), and
 * creating or updating a product.
 *
 * They are all *admin* writes, which is the line: this entry only ever exists in
 * an admin's own cache, so a customer-side write has nothing here to invalidate
 * and reaches the dashboard through its own next read instead.
 */
export const adminDashboardKeys = {
  all: ["admin-dashboard"] as const,
  snapshot: () => [...adminDashboardKeys.all, "snapshot"] as const,
};

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
 * `initialData` is **required**, not optional: a caller with nothing to seed has
 * no business rendering this page, and the route renders an error band instead
 * of the shell when its own read failed. That is also why there is no
 * `initialDataUpdatedAt` — the seed is an answer fetched moments ago, never a
 * stand-in for one, so the default 60-second `staleTime` should apply to it
 * exactly as it would to a client fetch.
 *
 * React Query stays the owner from there: this is the same key the certify
 * action invalidates, so the write's refetch lands here and re-renders the page.
 */
export function useAdminDashboard(initialData: AdminDashboardSnapshot) {
  const supabase = getClient();
  const service = new AdminDashboardService(supabase);

  return useQuery({
    queryKey: adminDashboardKeys.snapshot(),
    queryFn: () => service.getDashboard(),
    initialData,
  });
}
