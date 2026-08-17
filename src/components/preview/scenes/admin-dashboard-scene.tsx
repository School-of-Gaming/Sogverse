"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { AdminDashboardPageBody } from "@/components/admin/dashboard/admin-dashboard-page-body";
import {
  buildAdminDashboardFixture,
  type AdminDashboardScenario,
} from "@/components/admin/dashboard/mock-dashboard-fixtures";
import { resolveLocale } from "@/lib/constants/locales";

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
 * The fixture is memoised rather than rebuilt per render. Nothing in it depends
 * on a live clock — the whole scene is pinned to a fixed Monday morning, because
 * a calendar page's cases (a holiday week, a term straddling the window, a today
 * column) are arithmetic against a known date — so this is about work, not about
 * drift: sixteen weeks resolved over sixty products is not something to redo
 * every time a tab is switched. It depends on the *locale* rather than being
 * built once and kept, because the one `Intl`-formatted string inside it (how
 * long a gedu has waited) has to follow a previewer who switches language.
 */
export function AdminDashboardScene({
  scenario,
}: {
  scenario: AdminDashboardScenario;
}) {
  const locale = resolveLocale(useLocale());
  const data = useMemo(
    () => buildAdminDashboardFixture(scenario, locale),
    [scenario, locale],
  );

  return (
    <AdminDashboardPageBody
      data={data}
      onCertifyGedu={() => Promise.resolve()}
    />
  );
}
