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

function SkeletonStack({ invisible = false }: { invisible?: boolean }) {
  return (
    <div className={cn("space-y-3", invisible && "invisible")} aria-hidden>
      <NextSessionCardSkeleton />
      <UpcomingSessionCardSkeleton />
      <UpcomingSessionCardSkeleton />
      <UpcomingSessionCardSkeleton />
    </div>
  );
}

/**
 * Width + centering owned at the section-state level so loading, empty,
 * and loaded all share the same column geometry by construction. Single
 * source of truth — the consuming page doesn't need a wrapper.
 */
const SECTION_FRAME = "mx-auto max-w-lg";

export interface SessionsSectionProps {
  /**
   * The parent's enrolled sessions, sorted ascending by `sessionStart`.
   *
   * - `null` — query is in flight; render the skeleton placeholder.
   * - `[]` — query resolved with no sessions; render the empty-state copy.
   * - non-empty — render the soonest as a full `NextSessionCard` (live/locked
   *   CTA, countdown, reports), then the rest as compact `UpcomingSessionCard`s.
   */
  sessions: NextSessionCardProps[] | null;
}

/**
 * Single Sessions-section component for the parent dashboard. The three
 * states are encoded in the `sessions` prop's shape so the caller can't
 * forget to branch and the loading/empty/loaded heights stay aligned by
 * construction.
 */
export function SessionsSection({ sessions }: SessionsSectionProps) {
  const t = useTranslations("dashboardSections");

  if (sessions === null) {
    return (
      <div className={SECTION_FRAME} role="status" aria-busy="true">
        <SkeletonStack />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className={cn(SECTION_FRAME, "relative")}>
        <SkeletonStack invisible />
        <p className="absolute left-0 top-0 text-muted-foreground">
          {t("upcomingSessionsPlaceholderParent")}
        </p>
      </div>
    );
  }

  const [next, ...upcoming] = sessions;
  return (
    <div className={cn(SECTION_FRAME, "space-y-3")}>
      <NextSessionCard
        key={next.gamerSeed ?? `${next.gamerFirstName}-${next.productName}`}
        {...next}
      />
      {upcoming.map((s) => (
        <UpcomingSessionCard
          key={s.gamerSeed ?? `${s.gamerFirstName}-${s.productName}`}
          gamerFirstName={s.gamerFirstName}
          gamerSeed={s.gamerSeed}
          productName={s.productName}
          sessionStart={s.sessionStart}
        />
      ))}
    </div>
  );
}
