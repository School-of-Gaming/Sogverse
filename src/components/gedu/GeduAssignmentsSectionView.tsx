"use client";

import { GeduAssignmentCard } from "./GeduAssignmentCard";
import { GeduSubstitutionCard } from "./GeduSubstitutionCard";
import type {
  GeduAssignmentSummary,
  GeduSubstitutionSummary,
} from "@/lib/gedu-assignment-rollup";

export interface GeduAssignmentCardData {
  assignment: GeduAssignmentSummary;
  /** Pre-formatted cadence lines for this assignment's product. */
  scheduleLines: readonly string[];
}

/**
 * One card in a type noun's grid, in the two shapes it comes in.
 *
 * A gedu's week is one week whichever kind of seat put a session in it, so the
 * two share a grid rather than each getting a section: splitting them would put
 * the same Monday in two places on one page and give a gedu with a single substitution
 * a whole heading for one card. The tag is what lets one list carry both
 * without either card growing a branch on the other's fields.
 */
export type GeduDashboardCard =
  | { kind: "assignment"; item: GeduAssignmentCardData }
  | { kind: "substitution"; item: GeduSubstitutionSummary };

interface GeduAssignmentsSectionViewProps {
  /**
   * One type noun's worth of cards, already rolled up and ordered by the page:
   * the substitutions first, by substitution date, then the assignments by soonest next
   * session. The view sorts nothing and fetches nothing.
   */
  items: readonly GeduDashboardCard[];
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
 * **The rows stretch.** A card's zones are uniform because each one is
 * populated in every state, not because empty ones are padded — but two cards
 * can still differ by a wrapped product name or a line of cadence text.
 * Stretching squares the row off so the eye tracks along one bottom edge
 * instead of a ragged one, and each card pins its own footer to the bottom, so
 * the slack lands as breathing room inside the card rather than as a gap under
 * its last real content.
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
      {items.map((card) =>
        card.kind === "substitution" ? (
          // A substitution's identity is (group, substitution date) — a sub may hold two
          // Mondays of one group, and nothing else tells those two cards apart.
          <GeduSubstitutionCard
            key={`substitution-${card.item.groupId}-${card.item.substitutionDate}`}
            substitution={card.item}
          />
        ) : (
          <GeduAssignmentCard
            key={`assignment-${card.item.assignment.productId}-${card.item.assignment.groupId}`}
            assignment={card.item.assignment}
            scheduleLines={card.item.scheduleLines}
          />
        ),
      )}
    </div>
  );
}
