"use client";

import { useState } from "react";
import { AdminDashboardPageBody } from "@/components/admin/dashboard/admin-dashboard-page-body";
import {
  buildAdminDashboardFixture,
  type AdminDashboardScenario,
} from "@/components/admin/dashboard/mock-dashboard-fixtures";

/**
 * The `/admin` landing page, over fixtures.
 *
 * It renders the **same body the live route renders**, with a fixture set
 * standing in for the read that feeds it — a showcase that cannot drift, because
 * there is only one body and the scene is one of its two shells. Nothing here
 * queries, mutates or writes: every row link points at the real admin surface it
 * would open, and clicking one leaves the preview, which is the honest behaviour
 * for a link whose whole purpose is to be the way out of the queue.
 *
 * The certify action resolves immediately and writes nothing. The queue's own
 * behaviour is unchanged by that — the row leaves the list, the counted receipt
 * appears — which is the point of the action being a callback: the preview and
 * the live page differ only in what happens at the far end of it.
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

  return (
    <AdminDashboardPageBody
      data={data}
      onCertifyGedu={() => Promise.resolve()}
    />
  );
}
