"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { SessionAudience } from "@/types";
import { NextSessionCard, type NextSessionCardProps } from "./NextSessionCard";
import { UpcomingSessionCard } from "./UpcomingSessionCard";

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
   * - `[]` — viewer has no placed participations; render the empty-state copy.
   * - non-empty — render the soonest as a full `NextSessionCard` (live/locked
   *   CTA, countdown, reports), then the rest as compact `UpcomingSessionCard`s.
   *
   * No loading state: both dashboards server-prefetch the rows in the page's
   * Server Component and pass them through `useMyUpcomingSessions`'s required
   * `initialData`, so the section always renders with real data on first
   * paint. See `parent/page.tsx` / `gamer/page.tsx`.
   */
  sessions: NextSessionCardProps[];
  /**
   * Whose dashboard we're rendering on — `"customer"` is the parent's `/parent`
   * page (default; the admin UI demo also leaves this implicit), `"gamer"` is
   * the kid's `/gamer` page. Drives the empty-state copy so a logged-in gamer
   * doesn't get told "When your child's camp..." and vice versa. The session
   * list itself is identical between the two — the only real difference is
   * the data filter, which lives one layer up in the wrapper.
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
  onJoinClick?: (session: NextSessionCardProps) => void;
}

/**
 * Single Sessions-section component for both dashboards. The two states
 * (empty vs. loaded) are encoded in the `sessions` prop's length so the
 * caller can't forget to branch.
 */
export function SessionsSection({
  sessions,
  audience = "customer",
  onJoinClick,
}: SessionsSectionProps) {
  const t = useTranslations("dashboardSections");

  if (sessions.length === 0) {
    const placeholderKey =
      audience === "gamer"
        ? "upcomingSessionsEmptyStateGamer"
        : "upcomingSessionsEmptyStateParent";
    return <p className="text-muted-foreground">{t(placeholderKey)}</p>;
  }

  const [next, ...upcoming] = sessions;
  return (
    <div className={cn(SECTION_FRAME, "space-y-3")}>
      <NextSessionCard
        key={sessionKey(next)}
        {...next}
        onJoinClick={onJoinClick ? () => onJoinClick(next) : undefined}
      />
      {upcoming.map((s) => (
        <UpcomingSessionCard
          key={sessionKey(s)}
          gamerFirstName={s.gamerFirstName}
          gamerSeed={s.gamerSeed}
          productName={s.productName}
          sessionStart={s.sessionStart}
        />
      ))}
    </div>
  );
}

/**
 * Each row in the list is one *occurrence*, not one (gamer, product) tuple
 * — a single weekly club emits 8 cards for the same gamer + product, and a
 * camp emits a card per scheduled day. The start instant disambiguates
 * those, so the key has to include it. `(gamer, product)` alone collides.
 */
function sessionKey(s: NextSessionCardProps): string {
  return `${s.gamerSeed ?? s.gamerFirstName}-${s.productName}-${s.sessionStart.toISOString()}`;
}
