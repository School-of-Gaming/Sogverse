"use client";

import { useCallback, useMemo } from "react";
import { useLocale } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { resolveLocale } from "@/lib/constants/locales";
import { useNow, useTimezone } from "@/providers";
import {
  sessionSubstitutionKeys,
  useAdminSubstitutionQueue,
  useApproveSessionSubstitutionOffer,
  type AdminSubstitutionQueue,
} from "@/services/session-substitution";
import { AdminSubstitutionsPageBody } from "./admin-substitutions-page-body";
import { buildAdminSubstitutionsData } from "./build-admin-substitutions-data";

/**
 * The Substitutions page's data shell: the read, the clock, the viewer's zone,
 * and the one write on the page.
 *
 * **There is no loading state here and none below.** The route awaited the
 * document server-side and hydrated it, so the first paint is the finished
 * page; the snapshot arrives as a required prop, which is what makes the
 * query's `data` non-optional and the absent loading branch a compile-time fact
 * rather than a convention.
 *
 * **The mapping runs on every tick of `useNow()`, deliberately.** Two things on
 * this page are genuinely thirty-second facts — how long until a session starts,
 * and whether that is inside the day that makes a row urgent — and both are
 * what the page is *for*. The cost is a map over a handful of rows and a
 * date-per-row occurrence resolution, which is nothing like the sixteen weeks
 * of schedule arithmetic the dashboard samples once a day to avoid.
 */
export function AdminSubstitutionsPage({
  initialQueue,
}: {
  initialQueue: AdminSubstitutionQueue;
}) {
  const locale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const now = useNow();
  const queryClient = useQueryClient();

  const { data: queue } = useAdminSubstitutionQueue(initialQueue);
  const approveOffer = useApproveSessionSubstitutionOffer();

  const data = useMemo(
    () =>
      buildAdminSubstitutionsData({
        queue,
        locale,
        viewerTimeZone: timeZone,
        now,
      }),
    [queue, locale, timeZone, now],
  );

  /**
   * Seat the gedu behind one offer, and wait for the page to agree.
   *
   * `mutateAsync` because the panel drops a row on the resolution and shows a
   * retry on the rejection, and a fire-and-forget call could tell it neither.
   * The awaited invalidation is the other half of that contract: the mutation's
   * own `onSuccess` fires its fan-out without waiting for any of it, which is
   * right for the documents nothing on this page is reading, and not enough for
   * the one it is. Awaiting this key means the refetched document has already
   * moved the request out of the queue and into the fortnight below by the time
   * the promise settles — so the row leaves once, rather than leaving on the
   * receipt and coming back for a frame when the old document re-renders.
   */
  const handleApproveOffer = useCallback(
    async (offerId: string) => {
      await approveOffer.mutateAsync({ offerId });
      await queryClient.invalidateQueries({
        queryKey: sessionSubstitutionKeys.adminQueue(),
      });
    },
    [approveOffer, queryClient],
  );

  return (
    <AdminSubstitutionsPageBody data={data} onApproveOffer={handleApproveOffer} />
  );
}
