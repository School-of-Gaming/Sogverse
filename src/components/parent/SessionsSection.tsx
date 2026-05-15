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
            <p className="text-lg leading-tight">{" "}</p>
            <p className="text-sm">{" "}</p>
            <p className="text-sm">{" "}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="flex justify-center">
          <div className="h-9" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs">{" "}</p>
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
          <p className="text-sm">{" "}</p>
          <p className="text-xs">{" "}</p>
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
 * Section-level loading placeholder. Reserves the same vertical space the
 * loaded stack will occupy so the page chrome below doesn't reflow when
 * sessions land.
 */
export function SessionsSectionLoading() {
  return (
    <div role="status" aria-busy="true">
      <SkeletonStack />
    </div>
  );
}

/**
 * Empty state — shown when the parent has no upcoming sessions. Same copy
 * the gamer dashboard uses for its sessions section, phrased for the parent.
 * An invisible skeleton stack sits beneath the message so the section
 * reserves the same vertical space as the loading and loaded states.
 */
export function SessionsSectionEmpty() {
  const t = useTranslations("dashboardSections");
  return (
    <div className="relative">
      <SkeletonStack invisible />
      <p className="absolute left-0 top-0 text-muted-foreground">
        {t("upcomingSessionsPlaceholderParent")}
      </p>
    </div>
  );
}

/**
 * Loaded state — the soonest session at the top as a full `NextSessionCard`
 * (live/locked CTA, countdown, reports), then every remaining session as a
 * compact `UpcomingSessionCard` (purely informational). Caller is responsible
 * for sorting ascending by `nextSessionStart`.
 */
export function SessionsSectionLoaded({
  sessions,
}: {
  sessions: NextSessionCardProps[];
}) {
  if (sessions.length === 0) return null;
  const [next, ...upcoming] = sessions;

  return (
    <div className="space-y-3">
      <NextSessionCard
        key={`${next.gamerFirstName}-${next.productName}`}
        {...next}
      />
      {upcoming.map((s) => (
        <UpcomingSessionCard
          key={`${s.gamerFirstName}-${s.productName}`}
          gamerFirstName={s.gamerFirstName}
          gamerSeed={s.gamerSeed}
          productName={s.productName}
          nextSessionStart={s.nextSessionStart}
        />
      ))}
    </div>
  );
}
