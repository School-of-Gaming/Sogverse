"use client";

import { useState } from "react";
import { SwitchToGamerDialog } from "@/components/customer/SwitchToGamerDialog";
import {
  useMyUpcomingSessions,
  type MyUpcomingSessionRow,
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
 * Parent-specific wiring: the Join Voice button on the soonest session has
 * to route through the switch-to-gamer dialog instead of a direct link.
 * The parent is signed in as themselves; the voice token endpoint gates
 * access on the *gamer's* enrollment in the group, so a direct nav would
 * always 403. The dialog confirms intent, the switch-account POST swaps
 * the session cookies, and the post-switch `window.location.href` lands
 * the (now-gamer) browser straight on the voice room URL captured at
 * click-time.
 */
export function ParentSessionsSection({
  initialRows,
}: {
  initialRows: MyUpcomingSessionRow[];
}) {
  const sessions = useMyUpcomingSessions("customer", {
    initialData: initialRows,
  });
  const [switchTarget, setSwitchTarget] = useState<{
    gamerId: string;
    gamerDisplayName: string;
    productName: string;
    redirectUrl: string;
  } | null>(null);

  return (
    <>
      <SessionsSection
        sessions={sessions}
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
        <SwitchToGamerDialog
          open={!!switchTarget}
          onOpenChange={(open) => {
            if (!open) setSwitchTarget(null);
          }}
          gamerId={switchTarget.gamerId}
          gamerDisplayName={switchTarget.gamerDisplayName}
          productName={switchTarget.productName}
          redirectUrl={switchTarget.redirectUrl}
        />
      )}
    </>
  );
}
