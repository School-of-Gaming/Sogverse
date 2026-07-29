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
   * Which card is mid-leave. Set synchronously *before* `mutate()` so it is
   * live for the very next render, and deliberately not derived from
   * `leaveWaitlist.isPending` — that flips false the moment React Query
   * dispatches success, which is before `onSuccess` invalidates and well before
   * the refetch drops the row. Cleared only on error, the one outcome where the
   * parent has to try again; on success the row disappears and the card with
   * it. See the "Loading & Disabled State" rule.
   */
  const [leavingId, setLeavingId] = useState<string | null>(null);

  return (
    <>
      <SessionsSection
        sessions={sessions}
        waitlist={waitlist}
        leavingParticipationId={leavingId}
        onLeaveWaitlist={(entry) => {
          setLeavingId(entry.participationId);
          leaveWaitlist.mutate(
            { participationId: entry.participationId },
            {
              // Un-dim in place. With no toast anywhere in the app there is
              // nothing else to say what happened, so the card simply comes
              // back to life where it already was and stays clickable.
              onError: () => setLeavingId(null),
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
