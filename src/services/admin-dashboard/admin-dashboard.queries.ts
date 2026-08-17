"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { AdminDashboardService } from "./admin-dashboard.service";

/**
 * One key, because there is one query. The hierarchy is still written out so a
 * mutation elsewhere that changes what the dashboard says — certifying a gedu,
 * assigning a group, setting a fee — can invalidate `adminDashboardKeys.all`
 * and have this read follow.
 */
export const adminDashboardKeys = {
  all: ["admin-dashboard"] as const,
  snapshot: () => [...adminDashboardKeys.all, "snapshot"] as const,
};

/**
 * The whole admin dashboard in one read.
 *
 * It is a **perceptibly slow call** by construction and known to be one before
 * it is made: four platform-wide aggregates, one of them counting participations
 * and groups across every live product. So the page renders a structured
 * skeleton immediately rather than waiting to find out how long it takes.
 */
export function useAdminDashboard() {
  const supabase = getClient();
  const service = new AdminDashboardService(supabase);

  return useQuery({
    queryKey: adminDashboardKeys.snapshot(),
    queryFn: () => service.getDashboard(),
  });
}
