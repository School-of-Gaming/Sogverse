"use client";

import { useTranslations } from "next-intl";
import { NextSessionCard, type NextSessionCardProps } from "./NextSessionCard";

/**
 * Section-level loading placeholder. Renders generic pulsing blocks rather
 * than card-shaped skeletons — the participation query hasn't told us yet
 * whether there are 0 or N sessions, so committing to a card-shaped layout
 * during loading would either over- or under-promise the final height.
 */
export function SessionsSectionLoading() {
  return (
    <div className="space-y-3" role="status" aria-busy="true">
      <div className="h-24 animate-pulse rounded-md bg-muted" />
      <div className="h-24 animate-pulse rounded-md bg-muted" />
    </div>
  );
}

/**
 * Empty state — shown when the parent has no upcoming sessions. Same copy
 * the gamer dashboard uses for its sessions section, phrased for the parent.
 */
export function SessionsSectionEmpty() {
  const t = useTranslations("dashboardSections");
  return (
    <p className="text-muted-foreground">
      {t("upcomingSessionsPlaceholderParent")}
    </p>
  );
}

/**
 * Loaded state — vertical stack of cards, one per (gamer × enrolled product)
 * with an upcoming session. Caller is responsible for sorting ascending by
 * `nextSessionStart` so the soonest session is on top.
 */
export function SessionsSectionLoaded({
  sessions,
}: {
  sessions: NextSessionCardProps[];
}) {
  return (
    <div className="space-y-3">
      {sessions.map((s) => (
        <NextSessionCard
          key={`${s.gamerFirstName}-${s.productName}`}
          {...s}
        />
      ))}
    </div>
  );
}
