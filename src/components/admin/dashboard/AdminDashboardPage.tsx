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
import { useSeatOfferSweepOnMount } from "@/services/participations";
import { AdminDashboardPageBody } from "./admin-dashboard-page-body";
import {
  buildAdminDashboardData,
  buildCertificationQueue,
  viewerZoneAbbrev,
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
 * **The read arrives already answered.** The route awaits the RPC, hydrates it
 * into React Query on the same key the certify action invalidates, and hands the
 * same document in as `initialSnapshot` so the query's `data` is not optional.
 * So the query starts with data rather than pending,
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
 *
 * **The one exception is a first-ever visit with no timezone cookie, and it is
 * accepted.** `TimezoneProvider` is cookie-seeded on the server and corrects
 * itself post-mount from `Intl.DateTimeFormat().resolvedOptions()`, so an admin
 * arriving without that cookie is served the Helsinki fallback and then, one
 * effect later, their real zone. The grid re-groups once when that lands. It is
 * a genuine shift and it is not gated on, for two reasons: gating would mean a
 * loading state on a page whose entire design is that it has none, and the
 * correction fires only on the visit *before* the cookie exists — never again
 * on that device, and never at all for the Helsinki majority whose fallback was
 * already right.
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

  /**
   * A seat offer runs out by the clock, and there is no clock — so an admin
   * arriving here *is* the observation. The queue below subtracts live offers
   * from a product's open seats, which means a lapsed one is precisely a
   * product that ought to be back on this list.
   *
   * **The read is sequenced behind it rather than interrupted by it, and that
   * is a layout decision.** The attention queue is a sorted run, and a claim
   * puts a product *back* into it — so an invalidation arriving after the page
   * had painted would insert a card into the middle of a list an admin was
   * already reading, on data's own schedule and with nothing they did to
   * explain it. That is the shift the layout rule forbids outright. Gating the
   * query instead means any fetch this mount was going to make happens once,
   * after the claim, and carries it — so the sorted run is right the first time
   * it is drawn and never re-sorts underneath anyone.
   *
   * Two things keep the gate from becoming a loading state. The flag flips on
   * *settle*, not on success, so a Brevo outage or a lost request cannot hold
   * the page's own data hostage. And the seed means there is nothing to hold
   * back in the first place: the route already awaited this snapshot, so the
   * dashboard paints in full while the sweep is still in the air. What is
   * deferred is a network fetch nobody is looking at, not a page.
   *
   * The invalidation is suppressed here for the same reason — it is the
   * interruption this arrangement exists to remove, and a claim it makes is
   * reflected the next time this page is opened. The groups panel keeps it: its
   * board is a different read, cheap to redo, and one that has to show a freed
   * seat while the admin is standing in front of the queue it came out of.
   */
  const sweepSettled = useSeatOfferSweepOnMount({ invalidateDashboard: false });

  const { data: snapshot } = useAdminDashboard(initialSnapshot, {
    enabled: sweepSettled,
  });
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
   * The two parts that genuinely want the ticking clock, laid over the
   * day-granular half rather than dragging the schedule's arithmetic along
   * behind them. Both are cheap — a map over a queue of a handful of rows, and
   * one `Intl` format — and neither is a midnight fact:
   *
   * - "registered 3 minutes ago" has to become "an hour ago" while the page
   *   sits open. A candidate's contract-acceptance date rides along in that same
   *   map — it is not a ticking fact, but re-deriving it in a second place to
   *   keep this list pure would buy nothing and cost the queue a second source.
   * - a zone's abbreviation turns over *inside* a day. Helsinki becomes EEST at
   *   03:00 on the last Sunday in March, and a schedule sampled at midnight
   *   would go on saying EET beside times it had already moved.
   */
  const data = useMemo(
    () => ({
      ...dayData,
      now,
      timeZoneAbbrev: viewerZoneAbbrev(
        snapshot.schedule_products,
        timeZone,
        locale,
        now,
      ),
      uncertifiedGedus: buildCertificationQueue(
        snapshot.certification_queue,
        locale,
        now,
        timeZone,
      ),
    }),
    [
      dayData,
      snapshot.schedule_products,
      snapshot.certification_queue,
      locale,
      timeZone,
      now,
    ],
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
