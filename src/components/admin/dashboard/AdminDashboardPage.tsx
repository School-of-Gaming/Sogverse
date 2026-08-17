/* eslint-disable i18next/no-literal-string -- design-mock phase; see the note on
   `product-attention-grid.tsx`. */
"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { resolveLocale } from "@/lib/constants/locales";
import { useNow, useTimezone } from "@/providers";
import { adminDashboardKeys, useAdminDashboard } from "@/services/admin-dashboard";
import { useSetGeduCertified } from "@/services/gedu";
import { AdminDashboardPageBody } from "./admin-dashboard-page-body";
import { AdminDashboardSkeleton } from "./AdminDashboardSkeleton";
import { buildAdminDashboardData } from "./build-admin-dashboard-data";

/**
 * The admin dashboard's data shell: one read, one mapping, one write.
 *
 * **One read, because the page is one question.** Four platform-wide aggregates
 * that are only meaningful together — the schedule marks a chip *because* the
 * attention queue flagged that product — and four separate queries would be four
 * cache entries free to disagree about what the platform looks like. The RPC
 * answers all of it at one moment; this shell turns that document into the
 * shapes the body renders and owns the one action on the page.
 *
 * **The clock and the zone enter here and are passed down as data.** The body
 * never reads either: a page that resolved its own "now" per section could show
 * a week highlighted around one instant and a queue aged against another. The
 * zone is the *viewer's* — a session carries a clock face, so it converts — and
 * the mapping re-groups every occurrence onto the weekday it lands on there.
 */
export function AdminDashboardPage() {
  const locale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const now = useNow();
  const queryClient = useQueryClient();

  const { data: snapshot, isError, error } = useAdminDashboard();
  const setCertified = useSetGeduCertified();

  const data = useMemo(
    () =>
      snapshot === undefined
        ? null
        : buildAdminDashboardData({
            snapshot,
            locale,
            viewerTimeZone: timeZone,
            now,
          }),
    [snapshot, locale, timeZone, now],
  );

  /**
   * Certify one gedu, and make every surface that names them agree again.
   *
   * `mutateAsync` rather than `mutate` because the queue needs to know *when* —
   * the row leaves the list on the resolution and shows a retry on the
   * rejection, and a fire-and-forget call could tell it neither. The mutation
   * already invalidates the whole `gedu-profiles` key on success — the users
   * list, the picker and the certification card follow from that — so all this
   * adds is the dashboard's own key, because the strip's "12 certified" and the
   * row that just left the queue are the same fact counted twice.
   */
  const handleCertifyGedu = useCallback(
    async (geduId: string) => {
      await setCertified.mutateAsync({ geduId, certified: true });
      await queryClient.invalidateQueries({ queryKey: adminDashboardKeys.all });
    },
    [setCertified, queryClient],
  );

  if (isError) {
    return (
      <div className="space-y-6 pb-12">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            What needs an admin today, who is on the platform, and what is
            running.
          </p>
        </div>
        {/* No partial page behind it. Every band on this dashboard comes out of
            the same read, so a failure is a failure of all of them — rendering
            an empty queue and an empty schedule would say the platform is fine
            when what happened is that nobody asked it. */}
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Could not load the dashboard
          {error instanceof Error && error.message.length > 0
            ? ` — ${error.message}`
            : ""}
          . Refresh to try again.
        </p>
      </div>
    );
  }

  if (data === null) return <AdminDashboardSkeleton />;

  return (
    <AdminDashboardPageBody data={data} onCertifyGedu={handleCertifyGedu} />
  );
}
