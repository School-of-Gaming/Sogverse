"use client";

import { useState } from "react";
import { AdminDashboardPageBody } from "@/components/admin/dashboard/admin-dashboard-page-body";
import {
  buildAdminDashboardFixture,
  type AdminDashboardScenario,
} from "@/components/admin/dashboard/mock-dashboard-fixtures";

/**
 * The redesigned `/admin` landing page, over fixtures.
 *
 * It renders the **draft** body — the one that will replace the placeholder page
 * when this design is signed off — with a fixture set standing in for the reads
 * that will feed it. Nothing here queries, mutates or writes: every row link
 * points at the real admin surface it would open, and clicking one leaves the
 * preview, which is the honest behaviour for a link whose whole purpose is to be
 * the way out of the queue.
 *
 * The fixture is built once and held in state rather than rebuilt per render.
 * Nothing in it depends on a live clock — the whole scene is pinned to a fixed
 * Monday morning, because a calendar page's cases (a holiday week, a term
 * straddling the window, a today column) are arithmetic against a known date —
 * so this is about work, not about drift: sixteen weeks resolved over sixty
 * products is not something to redo every time a tab is switched.
 */
export function AdminDashboardScene({
  scenario,
}: {
  scenario: AdminDashboardScenario;
}) {
  const [data] = useState(() => buildAdminDashboardFixture(scenario));

  return <AdminDashboardPageBody data={data} />;
}
