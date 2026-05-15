"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { NextSessionCard, type NextSessionCardProps } from "./NextSessionCard";
import { UpcomingSessionCard } from "./UpcomingSessionCard";

/**
 * Skeletons mirror the real cards' structural primitives (Card + CardHeader
 * + CardContent with the same padding, the same `text-*` classes on every
 * row, the same button sizes) so their outer heights are pixel-identical
 * to the rendered cards. Inner placeholders are sized invisibly — the
 * structure only exists to drive the height. The whole card pulses muted
 * as the visual.
 *
 * If a real card's layout changes (padding, line-heights, button sizes),
 * mirror it here too or loading/empty will reflow vs. loaded.
 */
function NextSessionCardSkeleton() {
  return (
    <Card className="animate-pulse bg-muted/40">
      <CardHeader className="pb-1">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 shrink-0" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-lg leading-tight">{" "}</p>
            <p className="text-sm">{" "}</p>
            <p className="text-sm">{" "}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex justify-center">
          <div className="h-9" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs">{" "}</p>
          <div className="h-9" />
        </div>
      </CardContent>
    </Card>
  );
}

function UpcomingSessionCardSkeleton() {
  return (
    <Card className="animate-pulse bg-muted/40">
      <CardContent className="flex items-center gap-3 p-3 pt-3">
        <div className="h-8 w-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm">{" "}</p>
          <p className="text-xs">{" "}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Skeleton count matches the per-product 8-occurrence cap the adapter
 * (`src/lib/upcoming-sessions.ts`) emits for open-ended clubs: one prominent
 * `NextSessionCard` slot at the top + seven compact `UpcomingSessionCard`
 * slots below. End-dated products can run longer than 8, but 8 is the most
 * representative "full" load to show during the in-flight render.
 */
function SkeletonStack() {
  return (
    <div className="space-y-3" aria-hidden>
      <NextSessionCardSkeleton />
      <UpcomingSessionCardSkeleton />
      <UpcomingSessionCardSkeleton />
      <UpcomingSessionCardSkeleton />
      <UpcomingSessionCardSkeleton />
      <UpcomingSessionCardSkeleton />
      <UpcomingSessionCardSkeleton />
      <UpcomingSessionCardSkeleton />
    </div>
  );
}

/**
 * Width + centering shared by the loading and loaded states so the cards
 * stay anchored when sessions resolve. The empty state opts out — it's
 * just a single line of copy and doesn't need the column geometry.
 *
 * `w-full` is load-bearing: in a flex-column parent (like the admin demo)
 * `mx-auto` alone triggers auto-margin shrink-to-fit, so the wrapper
 * collapses to its content's intrinsic width and the skeletons end up
 * much narrower than the column. Setting `w-full` explicitly keeps the
 * wrapper at parent-width, then `max-w-lg` caps it and `mx-auto` centers
 * within the overflow. Same outcome as the block-layout case on the
 * parent dashboard, just made resilient to flex contexts too.
 */
const SECTION_FRAME = "mx-auto w-full max-w-lg";

export interface SessionsSectionProps {
  /**
   * The viewer's enrolled sessions, sorted ascending by `sessionStart`.
   *
   * - `null` — query is in flight; render the skeleton placeholder.
   * - `[]` — query resolved with no sessions; render the empty-state copy.
   * - non-empty — render the soonest as a full `NextSessionCard` (live/locked
   *   CTA, countdown, reports), then the rest as compact `UpcomingSessionCard`s.
   */
  sessions: NextSessionCardProps[] | null;
  /**
   * Whose dashboard we're rendering on — `"customer"` is the parent's `/parent`
   * page (default; the admin UI demo also leaves this implicit), `"gamer"` is
   * the kid's `/gamer` page. Drives the empty-state copy so a logged-in gamer
   * doesn't get told "When your child's camp..." and vice versa. The session
   * list itself is identical between the two — the only real difference is
   * the data filter, which lives one layer up in the wrapper.
   */
  audience?: "customer" | "gamer";
}

/**
 * Single Sessions-section component for both dashboards. The three states are
 * encoded in the `sessions` prop's shape so the caller can't forget to branch
 * and the loading/empty/loaded heights stay aligned by construction.
 */
export function SessionsSection({
  sessions,
  audience = "customer",
}: SessionsSectionProps) {
  const t = useTranslations("dashboardSections");

  if (sessions === null) {
    return (
      <div className={SECTION_FRAME} role="status" aria-busy="true">
        <SkeletonStack />
      </div>
    );
  }

  if (sessions.length === 0) {
    const placeholderKey =
      audience === "gamer"
        ? "upcomingSessionsPlaceholderGamer"
        : "upcomingSessionsPlaceholderParent";
    return <p className="text-muted-foreground">{t(placeholderKey)}</p>;
  }

  const [next, ...upcoming] = sessions;
  return (
    <div className={cn(SECTION_FRAME, "space-y-3")}>
      <NextSessionCard key={sessionKey(next)} {...next} />
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
