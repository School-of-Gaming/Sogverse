"use client";

import { useTranslations } from "next-intl";
import { GeduAssignmentCard } from "./GeduAssignmentCard";
import type { GeduAssignmentSummary } from "@/lib/gedu-assignment-rollup";

export interface GeduAssignmentCardData {
  assignment: GeduAssignmentSummary;
  /** Pre-formatted cadence lines for this assignment's product. */
  scheduleLines: readonly string[];
}

interface GeduAssignmentsSectionViewProps {
  /**
   * The gedu's assignments, already rolled up and sorted by soonest next
   * session ascending. The view sorts nothing and fetches nothing.
   */
  items: readonly GeduAssignmentCardData[];
}

/**
 * Presentational core of the gedu dashboard's groups section: one card per
 * assignment, soonest session first.
 *
 * Every card is the same weight. The old section promoted its soonest occurrence
 * into a bigger card and demoted the rest to compact rows, which made sense when
 * the list was occurrences of one thing; with one card per room the gedu runs,
 * the ordering already says which is next, and shrinking the others would just
 * make a second club harder to read for no gain.
 *
 * Takes rows as props and holds no query, so the same markup can back both the
 * live dashboard once the shell supplies the roll-up and a fixture-driven
 * full-page preview scene today.
 */
export function GeduAssignmentsSectionView({
  items,
}: GeduAssignmentsSectionViewProps) {
  const t = useTranslations("dashboardSections");

  if (items.length === 0) {
    return <p className="text-muted-foreground">{t("myGroupsEmptyStateGedu")}</p>;
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-3">
      {items.map(({ assignment, scheduleLines }) => (
        <GeduAssignmentCard
          key={`${assignment.productId}-${assignment.groupId}`}
          assignment={assignment}
          scheduleLines={scheduleLines}
        />
      ))}
    </div>
  );
}
