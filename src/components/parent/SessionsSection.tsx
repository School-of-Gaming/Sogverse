"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { SessionAudience } from "@/types";
import type { UpcomingSessionEntry } from "@/lib/upcoming-sessions";
import type { WaitlistEntry } from "@/lib/waitlist-entries";
import { NextSessionCard } from "./NextSessionCard";
import { UpcomingSessionCard } from "./UpcomingSessionCard";
import { WaitlistCard } from "./WaitlistCard";

/**
 * Width + centering shared with the loaded state so the column geometry is
 * stable. The empty state opts out — it's just a single line of copy and
 * doesn't need the column.
 *
 * `w-full` is load-bearing: in a flex-column parent (like the admin demo)
 * `mx-auto` alone triggers auto-margin shrink-to-fit, so the wrapper
 * collapses to its content's intrinsic width and the cards end up much
 * narrower than the column. Setting `w-full` explicitly keeps the wrapper
 * at parent-width, then `max-w-lg` caps it and `mx-auto` centers within
 * the overflow.
 */
const SECTION_FRAME = "mx-auto w-full max-w-lg";

export interface SessionsSectionProps {
  /**
   * The viewer's enrolled sessions, sorted ascending by `sessionStart`.
   *
   * - `[]` — viewer has no placed participations. Combined with an empty
   *   `waitlist`, this renders the empty-state copy; on its own it just means
   *   the Scheduled band is absent.
   * - non-empty — each entry's `isNext` flag decides its card: the soonest
   *   occurrence of every (gamer × product) renders as a full `NextSessionCard`
   *   (live/locked CTA, countdown, reports/Padlet), and every later occurrence
   *   of an already-promoted pairing renders as a compact `UpcomingSessionCard`.
   *   The flat time order is preserved, so the prominent cards appear mixed in
   *   among the compact ones wherever they fall.
   *
   * No loading state: both dashboards server-prefetch the rows in the page's
   * Server Component and pass them through `useMyUpcomingSessions`'s required
   * `initialData`, so the section always renders with real data on first
   * paint. See `parent/page.tsx` / `gamer/page.tsx`.
   */
  sessions: UpcomingSessionEntry[];
  /**
   * The viewer's waitlisted participations — clubs they're in line for, which
   * have no placement and therefore never appear in `sessions` (that read is
   * filtered to `status='active'`). Rendered as a band **above** the scheduled
   * cards.
   *
   * Defaults to `[]` so a caller that only has sessions — the admin demo's
   * per-state fixtures, for one — stays a one-prop component.
   */
  waitlist?: WaitlistEntry[];
  /**
   * Whose dashboard we're rendering on — `"customer"` is the parent's `/parent`
   * page (default; the admin UI demo also leaves this implicit), `"gamer"` is
   * the kid's `/gamer` page. Drives the empty-state copy so a logged-in gamer
   * doesn't get told "When your child's camp..." and vice versa, and gates the
   * waitlist cards' leave badge. The session list itself is identical between
   * the two — the only real difference is the data filter, which lives one
   * layer up in the wrapper.
   */
  audience?: SessionAudience;
  /**
   * Optional click handler for the `NextSessionCard`'s Join button. Used by
   * the parent dashboard to intercept the click and open the switch-to-gamer
   * dialog (the parent is signed in as themselves; the voice room is gated
   * by the gamer's enrollment). The caller receives the session entry so it
   * can route on `gamerSeed` (gamer id) + `voiceHref`. Omit on the gamer
   * dashboard so the normal Link navigation is used.
   */
  onJoinClick?: (session: UpcomingSessionEntry) => void;
  /**
   * Give up a waitlist spot. Omit and the cards render read-only — which is
   * what the gamer dashboard does, and what any caller with no mutation wired
   * gets. `WaitlistCard` additionally refuses to show the badge for
   * `audience="gamer"` regardless of this handler.
   */
  onLeaveWaitlist?: (entry: WaitlistEntry) => void;
  /**
   * The `participationId` whose leave is in flight, or `null`. Held by the
   * caller (not derived from `mutation.isPending`) and kept set until the row
   * leaves the list, so the card stays dimmed and its badge locked across the
   * refetch — see the "Loading & Disabled State" rule.
   */
  leavingParticipationId?: string | null;
}

/**
 * Single Sessions-section component for both dashboards. The three states
 * (empty vs. waitlist vs. scheduled) are encoded in the two list props' lengths
 * so the caller can't forget to branch.
 *
 * Waitlist sits above scheduled, and the band labels appear **only when both
 * bands do**. They exist to tell two groups of cards apart, so with one group
 * there is nothing to tell apart: the section's own "Sessions" heading is
 * already saying what the list is, and a lone "Scheduled" label under it would
 * be chrome that earns nothing. This also leaves the common case — a family
 * with sessions and no waitlist spots — looking exactly as it did before the
 * band existed.
 *
 * The label appearing later is not a layout-stability problem: both lists come
 * from one server prefetch and paint together, so a viewer never watches a
 * heading push rendered content around.
 */
export function SessionsSection({
  sessions,
  waitlist = [],
  audience = "customer",
  onJoinClick,
  onLeaveWaitlist,
  leavingParticipationId = null,
}: SessionsSectionProps) {
  const t = useTranslations("dashboardSections");

  // Only when the viewer holds *nothing* — the pre-waitlist version keyed this
  // off the session list alone, which told a family holding two waitlist spots
  // that they had no upcoming sessions and then showed them nothing at all.
  if (sessions.length === 0 && waitlist.length === 0) {
    const placeholderKey =
      audience === "gamer"
        ? "upcomingSessionsEmptyStateGamer"
        : "upcomingSessionsEmptyStateParent";
    return <p className="text-muted-foreground">{t(placeholderKey)}</p>;
  }

  // Both non-empty is the only arrangement a reader has to disambiguate.
  const showBandLabels = waitlist.length > 0 && sessions.length > 0;

  return (
    <div className={cn(SECTION_FRAME, "space-y-6")}>
      {waitlist.length > 0 && (
        <div className="space-y-3">
          {showBandLabels && <BandLabel>{t("waitlistBand")}</BandLabel>}
          {waitlist.map((entry) => (
            <WaitlistCard
              key={entry.participationId}
              productName={entry.productName}
              gamerFirstName={entry.gamerFirstName}
              gamerSeed={entry.gamerSeed}
              position={entry.position}
              audience={audience}
              onLeave={
                onLeaveWaitlist ? () => onLeaveWaitlist(entry) : undefined
              }
              leaving={leavingParticipationId === entry.participationId}
            />
          ))}
        </div>
      )}

      {sessions.length > 0 && (
        <div className="space-y-3">
          {showBandLabels && <BandLabel>{t("scheduledBand")}</BandLabel>}
          {/* The flat time order is preserved; `isNext` (set in
              `expandUpcomingSessions` for the soonest occurrence of each gamer ×
              product) decides which card each entry gets, so prominent and
              compact cards interleave by time. */}
          {sessions.map((s) =>
            s.isNext ? (
              <NextSessionCard
                key={sessionKey(s)}
                {...s}
                audience={audience}
                onJoinClick={onJoinClick ? () => onJoinClick(s) : undefined}
              />
            ) : (
              <UpcomingSessionCard
                key={sessionKey(s)}
                participationId={s.participationId}
                gamerFirstName={s.gamerFirstName}
                gamerSeed={s.gamerSeed}
                productName={s.productName}
                sessionStart={s.sessionStart}
                awaiting={s.awaiting}
                audience={audience}
                paymentProblem={s.paymentProblem}
                cancellation={s.cancellation}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Uppercase micro-label over a band. Same treatment as the topic chip inside
 * the cards and the admin demo's captions, so it reads as meta information
 * about the group rather than as content belonging to the first card.
 */
function BandLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * Each row in the list is one *occurrence*, not one (gamer, product) tuple
 * — a single weekly club emits 8 cards for the same gamer + product, and a
 * camp emits a card per scheduled day. The start instant disambiguates
 * those, so the key has to include it. `(gamer, product)` alone collides.
 */
function sessionKey(s: UpcomingSessionEntry): string {
  return `${s.gamerSeed ?? s.gamerFirstName}-${s.productName}-${s.sessionStart.toISOString()}`;
}
