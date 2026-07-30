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
  /**
   * How many of each product's past sessions still need a write-up.
   *
   * The dashboard's whole share of the session feed is this one aggregate per
   * product — no queue UI, just a badge pointing into the feed, and every card
   * already navigates to the product page. A product appears once per
   * occurrence in the list, so the badge is drawn on that product's *first*
   * card only; repeating it down eight weekly rows would read as eight
   * separate problems. Omit it entirely and no card carries a badge, which is
   * what the live dashboard does until the feed is wired up.
   */
  attentionByProductId?: Readonly<Record<string, number>>;
}

/**
 * Presentational core of the gedu dashboard's Sessions section: an ordered
 * list of upcoming occurrences, prominent-then-compact.
 *
 * It takes rows as props and holds no query, so the same markup backs the live
 * dashboard (wrapped by the section that owns the assignments query) and a
 * fixture-driven full-page preview scene.
 */
export function GroupsSectionView({
  items,
  attentionByProductId,
}: GroupsSectionViewProps) {
  const t = useTranslations("dashboardSections");

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground">
        {t("upcomingSessionsEmptyStateGedu")}
      </p>
    );
  }

  const alertCounts = firstCardAlertCounts(items, attentionByProductId);

  const [next, ...upcoming] = items;
  return (
    <div className="mx-auto w-full max-w-lg space-y-3">
      <GroupCard
        key={sessionKey(next)}
        {...next}
        alertCount={alertCounts[0]}
      />
      {upcoming.map((s, index) => (
        <UpcomingGroupSessionCard
          key={sessionKey(s)}
          productName={s.productName}
          sessionStart={s.sessionStart}
          openGroupHref={s.openGroupHref}
          alertCount={alertCounts[index + 1]}
        />
      ))}
    </div>
  );
}

/**
 * The badge count to draw on each card: a product's outstanding total on its
 * first occurrence in the list, zero on every later one (the badge renders
 * nothing at zero).
 */
function firstCardAlertCounts(
  items: readonly GroupSessionItem[],
  attentionByProductId: Readonly<Record<string, number>> | undefined,
): number[] {
  const seen = new Set<string>();
  return items.map((item) => {
    if (seen.has(item.productId)) return 0;
    seen.add(item.productId);
    return attentionByProductId?.[item.productId] ?? 0;
  });
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
