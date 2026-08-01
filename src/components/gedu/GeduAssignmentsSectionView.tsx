"use client";

import { GeduAssignmentCard } from "./GeduAssignmentCard";
import type { GeduAssignmentSummary } from "@/lib/gedu-assignment-rollup";

export interface GeduAssignmentCardData {
  assignment: GeduAssignmentSummary;
  /** Pre-formatted cadence lines for this assignment's product. */
  scheduleLines: readonly string[];
}

interface GeduAssignmentsSectionViewProps {
  /**
   * One type noun's worth of assignments, already rolled up and sorted by
   * soonest next session ascending. The view sorts nothing and fetches nothing.
   */
  items: readonly GeduAssignmentCardData[];
}

/**
 * The card grid for one type noun's assignments — the "Clubs" grid, or the
 * "Camps" one — soonest session first.
 *
 * **A responsive grid, not a stack.** A gedu surface is a desktop surface, and
 * a single 32rem column of cards down the middle of a laptop left two thirds of
 * the screen empty while pushing a gedu's third activity below the fold. The
 * cards are self-contained and equal — nothing reads across them — so they tile:
 * two up from `sm`, three from `xl`, where the section's width finally has room
 * for three cards that are still comfortable rather than three that are merely
 * narrow. Sorting is untouched, and a grid reads soonest-first left-to-right the
 * same way a column reads it top-to-bottom.
 *
 * **The rows stretch.** Cards reserve their own variable zones so state cannot
 * change their height, but two cards can still differ by a line of cadence text;
 * letting the grid stretch them squares the row off, so the eye tracks along one
 * bottom edge instead of a ragged one.
 *
 * Every card is the same weight. The old section promoted its soonest occurrence
 * into a bigger card and demoted the rest to compact rows, which made sense when
 * the list was occurrences of one thing; with one card per activity the gedu
 * runs, the ordering already says which is next, and shrinking the others would
 * just make a second club harder to read for no gain — and would break the grid.
 *
 * Takes rows as props and holds no query, so the same markup can back both the
 * live dashboard once the shell supplies the roll-up and a fixture-driven
 * full-page preview scene today. It renders no heading of its own: the page body
 * owns the type nouns, because it is the page that decides how many there are.
 */
export function GeduAssignmentsSectionView({
  items,
}: GeduAssignmentsSectionViewProps) {
  return (
    <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
