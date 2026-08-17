"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { formatInTimeZone } from "date-fns-tz";
import { resolveLocale } from "@/lib/constants/locales";
import { useNow, useTimezone } from "@/providers";
import {
  adminDashboardKeys,
  useAdminDashboard,
  type AdminDashboardSnapshot,
} from "@/services/admin-dashboard";
import { useSetGeduCertified } from "@/services/gedu";
import { AdminDashboardPageBody } from "./admin-dashboard-page-body";
import {
  buildAdminDashboardData,
  buildCertificationQueue,
} from "./build-admin-dashboard-data";

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
 * **The read arrives already answered.** The route awaits the RPC and hands the
 * snapshot in as `initialSnapshot`, which seeds React Query on the same key the
 * certify action invalidates. So the query starts with data rather than pending,
 * this component has no loading branch and no failure branch — a read that never
 * landed is the route's problem and never gets this far — and React Query is
 * still the owner from that point on: invalidating `adminDashboardKeys.all`
 * refetches, and the page re-renders off the new document.
 *
 * **The clock and the zone enter here and are passed down as data.** The body
 * never reads either: a page that resolved its own "now" per section could show
 * a week highlighted around one instant and a queue aged against another. Both
 * come from the providers the root layout seeds out of the request, which is
 * what makes the server render and the first client render agree — the schedule
 * does not shift under anyone a frame after hydration. The zone is the
 * *viewer's* — a session carries a clock face, so it converts — and the mapping
 * re-groups every occurrence onto the weekday it lands on there.
 */
export function AdminDashboardPage({
  initialSnapshot,
}: {
  initialSnapshot: AdminDashboardSnapshot;
}) {
  const locale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const now = useNow();
  const queryClient = useQueryClient();

  const { data: snapshot } = useAdminDashboard(initialSnapshot);
  const setCertified = useSetGeduCertified();

  const viewerDay = formatInTimeZone(now, timeZone, "yyyy-MM-dd");

  /**
   * The same clock, sampled once a calendar day.
   *
   * `useNow()` ticks every thirty seconds, and almost nothing on this page is a
   * thirty-second fact: which weeks exist, which occurrence lands on which
   * weekday for this viewer, what is coming up — all of it changes at midnight
   * and at no other time. Rebuilding it on every tick means resolving sixteen
   * weeks of occurrences across every live product, roughly seventeen thousand
   * zone conversions for a viewer outside Helsinki, twice a minute, to arrive at
   * a byte-identical answer.
   *
   * So the expensive half is memoised on this instant, which is re-read from
   * `now` exactly when the viewer's own calendar date changes. It is not a
   * second clock — it is a lower sampling rate on the only one, and the day it
   * names is always the day `now` is in.
   */
  const [dayClock, setDayClock] = useState(now);
  if (formatInTimeZone(dayClock, timeZone, "yyyy-MM-dd") !== viewerDay) {
    setDayClock(now);
  }

  const dayData = useMemo(
    () =>
      buildAdminDashboardData({
        snapshot,
        locale,
        viewerTimeZone: timeZone,
        now: dayClock,
      }),
    [snapshot, locale, timeZone, dayClock],
  );

  /**
   * The one part that genuinely wants the ticking clock: "registered 3 minutes
   * ago" has to become "an hour ago" while the page sits open. It is a map over
   * a queue of a handful of rows, so it is re-run per tick and laid over the
   * day-granular half, rather than dragging the schedule's arithmetic along
   * behind it.
   */
  const data = useMemo(
    () => ({
      ...dayData,
      now,
      uncertifiedGedus: buildCertificationQueue(
        snapshot.certification_queue,
        locale,
        now,
      ),
    }),
    [dayData, snapshot.certification_queue, locale, now],
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

  return (
    <AdminDashboardPageBody data={data} onCertifyGedu={handleCertifyGedu} />
  );
}
