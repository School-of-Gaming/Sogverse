"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SwitchProfileDialog } from "@/components/family/SwitchProfileDialog";
import {
  useLeaveWaitlist,
  useMyUpcomingSessions,
  useMyWaitlist,
  type MyUpcomingSessionRow,
  type MyWaitlistRow,
} from "@/services/participations";
import { SessionsSection } from "./SessionsSection";

/**
 * Data-bound variant of `SessionsSection` for the parent dashboard. Calls
 * `useMyUpcomingSessions` (which owns the expansion + reads `useNow()` for
 * the clock tick) and forwards the resulting `sessions` shape — `null`
 * while loading, `[]` when the parent has no placed participations,
 * otherwise the time-sorted list.
 *
 * `initialRows` is the server-prefetched payload (`parent/page.tsx`
 * fetches via `ParticipationsService` and passes it down). When supplied,
 * the React Query cache is seeded on first client render so the list
 * paints immediately — no skeleton flash. Without it, the hook falls
 * back to its own client-side fetch.
 *
 * The presentational `SessionsSection` stays prop-driven so the admin UI
 * demo can keep feeding it fixture data for its loading / empty / live /
 * countdown variants.
 *
 * Parent-specific wiring, two pieces:
 *
 * 1. The Join Voice button on each prominent session (one per gamer × product)
 * has to route through the switch-to-gamer dialog instead of a direct link.
 * The parent is signed in as themselves; the voice token endpoint gates
 * access on the *gamer's* enrollment in the group, so a direct nav would
 * always 403. The dialog confirms intent, the switch-account POST swaps
 * the session cookies, and the post-switch `window.location.href` lands
 * the (now-gamer) browser straight on the voice room URL captured at
 * click-time.
 *
 * 2. The waitlist cards' leave action, which exists only here — the gamer
 * dashboard renders the same band read-only, because giving up a place in line
 * is a decision for the adult who joined it.
 */
export function ParentSessionsSection({
  initialRows,
  initialWaitlistRows,
}: {
  initialRows: MyUpcomingSessionRow[];
  initialWaitlistRows: MyWaitlistRow[];
}) {
  const t = useTranslations("parent");
  const sessions = useMyUpcomingSessions("customer", {
    initialData: initialRows,
  });
  const waitlist = useMyWaitlist("customer", {
    initialData: initialWaitlistRows,
  });
  const leaveWaitlist = useLeaveWaitlist();
  const [switchTarget, setSwitchTarget] = useState<{
    gamerId: string;
    gamerDisplayName: string;
    productName: string;
    redirectUrl: string;
  } | null>(null);
  /**
   * Which cards are mid-leave. Each id is added synchronously *before*
   * `mutate()` so it is live for the very next render, and deliberately not
   * derived from `leaveWaitlist.isPending` — that flips false the moment React
   * Query dispatches success, which is before `onSuccess` invalidates and well
   * before the refetch drops the row. An id is removed only on that card's own
   * error, the one outcome where the parent has to try again; on success the
   * row disappears and the card with it. See the "Loading & Disabled State"
   * rule.
   *
   * A set, not one id: the band can hold several waitlist cards, each with its
   * own badge. A single id would make leaving a second card clear the first
   * card's flag mid-request — the first card would un-dim and re-enable while
   * its DELETE was still in flight, which is precisely the re-enable the rule
   * forbids. Every update is functional so two clicks landing in the same tick
   * don't overwrite each other.
   */
  const [leavingIds, setLeavingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  return (
    <>
      <SessionsSection
        sessions={sessions}
        waitlist={waitlist}
        leavingParticipationIds={leavingIds}
        onLeaveWaitlist={(entry) => {
          const { participationId } = entry;
          setLeavingIds((prev) => new Set(prev).add(participationId));
          leaveWaitlist.mutate(
            { participationId },
            {
              // Un-dim in place, and only this card — a sibling's leave may
              // still be in flight. With no toast anywhere in the app there is
              // nothing else to say what happened, so the card simply comes
              // back to life where it already was and stays clickable.
              onError: () =>
                setLeavingIds((prev) => {
                  const next = new Set(prev);
                  next.delete(participationId);
                  return next;
                }),
            },
          );
        }}
        onJoinClick={(session) => {
          // `voiceHref` is `"#"` when the product is in-person or the
          // participation is unassigned — the Join button only renders as
          // live when `voiceIsOpen` is true, and `voiceIsOpen` already
          // requires a live window, but defend against the dialog firing
          // with no destination just in case.
          if (session.voiceHref === "#" || !session.gamerSeed) return;
          setSwitchTarget({
            gamerId: session.gamerSeed,
            gamerDisplayName: session.gamerFirstName,
            productName: session.productName,
            redirectUrl: session.voiceHref,
          });
        }}
      />

      {switchTarget && (
        <SwitchProfileDialog
          open={!!switchTarget}
          onOpenChange={(open) => {
            if (!open) setSwitchTarget(null);
          }}
          target={{
            id: switchTarget.gamerId,
            role: "gamer",
            first_name: switchTarget.gamerDisplayName,
          }}
          redirectUrl={switchTarget.redirectUrl}
          title={t("switchToGamer.title", {
            name: switchTarget.gamerDisplayName,
            productName: switchTarget.productName,
          })}
          oneWayWarning={t("switchToGamer.oneWayWarning")}
        />
      )}
    </>
  );
}
