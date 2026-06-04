"use client";

import { useTranslations } from "next-intl";
import type { GroupSessionItem } from "@/lib/assigned-sessions";
import {
  useMyAssignedSessions,
  type MyAssignedProductSessionRow,
} from "@/services/assignments";
import { GroupCard } from "./GroupCard";
import { UpcomingGroupSessionCard } from "./UpcomingGroupSessionCard";

/**
 * Data-bound Sessions section for the gedu dashboard. Calls
 * `useMyAssignedSessions` (which owns the expansion + `useNow()` tick)
 * and splits the resulting time-sorted list: the soonest item renders
 * as the prominent `GroupCard` (Join button, countdown, counts line,
 * chevron), every session after that as a compact
 * `UpcomingGroupSessionCard`. Mirrors the parent's `SessionsSection`.
 *
 * `initialRows` is the server-prefetched payload from `gedu/page.tsx`
 * so the section paints with real data on first frame, no skeleton flash.
 */
export function GroupsSection({
  initialRows,
}: {
  initialRows: MyAssignedProductSessionRow[];
}) {
  const t = useTranslations("dashboardSections");
  const items = useMyAssignedSessions({ initialData: initialRows });

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground">
        {t("upcomingSessionsEmptyStateGedu")}
      </p>
    );
  }

  const [next, ...upcoming] = items;
  return (
    <div className="mx-auto w-full max-w-lg space-y-3">
      <GroupCard key={sessionKey(next)} {...next} />
      {upcoming.map((s) => (
        <UpcomingGroupSessionCard
          key={sessionKey(s)}
          productName={s.productName}
          sessionStart={s.sessionStart}
          openGroupHref={s.openGroupHref}
        />
      ))}
    </div>
  );
}

/**
 * Each row in the list is one *occurrence*, not one assignment — a
 * weekly club emits up to 8 cards for the same product, and a camp
 * emits a card per scheduled day. `productId` alone collides; the
 * start instant disambiguates.
 */
function sessionKey(s: GroupSessionItem): string {
  return `${s.productId}-${s.sessionStart.toISOString()}`;
}
