"use client";

import { useTranslations } from "next-intl";
import type { GroupSessionItem } from "@/lib/assigned-sessions";
import { GroupCard } from "./GroupCard";
import { UpcomingGroupSessionCard } from "./UpcomingGroupSessionCard";

interface GroupsSectionViewProps {
  /**
   * The gedu's upcoming occurrences, already sorted ascending by start. The
   * soonest one renders as the prominent card; everything after it as a
   * compact row. The view sorts nothing and fetches nothing.
   */
  items: readonly GroupSessionItem[];
}

/**
 * Presentational core of the gedu dashboard's Sessions section: an ordered
 * list of upcoming occurrences, prominent-then-compact.
 *
 * It takes rows as props and holds no query, so the same markup backs the live
 * dashboard (wrapped by the section that owns the assignments query) and a
 * fixture-driven full-page preview scene.
 *
 * **This is the live body, and it is on its way out.** The roll-up body beside
 * it — one card per assignment rather than one per occurrence — is what replaces
 * it at promotion, and that is where the needs-attention badge lives. It briefly
 * lived here too, plumbed through from a prop no caller ever passed, which meant
 * every badge on this surface rendered nothing while looking like a wired
 * feature. Nothing about the outstanding-write-up count belongs here until this
 * body is gone.
 */
export function GroupsSectionView({ items }: GroupsSectionViewProps) {
  const t = useTranslations("dashboardSections");

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
