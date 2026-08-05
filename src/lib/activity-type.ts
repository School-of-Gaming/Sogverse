import type { ProductType } from "@/types";

/**
 * The **type noun** taxonomy — the words the product uses for the things people
 * run and take part in, and the sections a dashboard is built out of.
 *
 * It is deliberately role-agnostic. A gedu's dashboard groups their assignments
 * under these nouns and a gamer's groups their enrollments under the same ones,
 * because the taxonomy is a fact about *product types* rather than about who is
 * looking: a camp is a camp from either end of it. Living in one neutral module
 * is what stops a family surface having to import something named after staff
 * work in order to say the word "club".
 *
 * Pure: no React, no clock, no locale. The heading map holds message *keys*, so
 * the caller resolves them through its own namespace.
 */

/**
 * The nouns, and there are three of them for four product types: the two club
 * types (`consumer_club` and `municipality_club`) differ only in who pays.
 * Nobody standing in the room can tell them apart and nobody has a reason to —
 * splitting a dashboard by billing arrangement would be the product showing its
 * accounting to the people using it.
 */
export type ActivityType = "club" | "camp" | "event";

/**
 * The order the nouns appear in, which is deliberately not alphabetical.
 *
 * Clubs first because they are the standing commitment — the thing that runs
 * every week for a term, and the reason most people open a dashboard at all.
 * Camps next: intense, but a fortnight. Events last: occasional, and somebody
 * with one is not usually opening the page for it.
 */
export const ACTIVITY_TYPE_ORDER: readonly ActivityType[] = [
  "club",
  "camp",
  "event",
];

/** Which noun a product type falls under. */
export function activityTypeOf(productType: ProductType): ActivityType {
  switch (productType) {
    case "consumer_club":
    case "municipality_club":
      return "club";
    case "camp":
      return "camp";
    case "event":
      return "event";
  }
}

export interface ActivityGroup<T> {
  type: ActivityType;
  items: T[];
}

/**
 * Split a run of items into one group per type noun, **skipping the types they
 * do not cover**.
 *
 * Somebody with three clubs and nothing else should see one heading, not one
 * heading and two empty ones — an empty group on a personal dashboard reads as
 * something missing rather than as something absent. So the shape of the page
 * follows what is actually there, and a camp-only reader never learns that
 * events exist.
 *
 * Order **within** a group is whatever the caller handed over, untouched, which
 * is soonest-first out of whichever roll-up produced it. Order **between**
 * groups is fixed, so the page does not reshuffle its own headings between two
 * people or between two terms for the same person.
 *
 * Generic over the item rather than tied to a card's shape: the grouping is a
 * fact about product types, and making it know what a dashboard card looks like
 * would drag a component's props into a pure module for no gain.
 */
export function groupByActivityType<T>(
  items: readonly T[],
  productTypeOf: (item: T) => ProductType,
): ActivityGroup<T>[] {
  const buckets = new Map<ActivityType, T[]>();
  for (const item of items) {
    const type = activityTypeOf(productTypeOf(item));
    const bucket = buckets.get(type);
    if (bucket === undefined) buckets.set(type, [item]);
    else bucket.push(item);
  }

  const groups: ActivityGroup<T>[] = [];
  for (const type of ACTIVITY_TYPE_ORDER) {
    const bucketed = buckets.get(type);
    if (bucketed !== undefined && bucketed.length > 0) {
      groups.push({ type, items: bucketed });
    }
  }
  return groups;
}

/**
 * The message key naming each type noun, which doubles as the anchor id its
 * section scrolls to. `satisfies` rather than an annotation so the values stay
 * literal and the compiler checks them against the message catalogue at the
 * call site.
 */
export const ACTIVITY_HEADING_KEY = {
  club: "clubs",
  camp: "camps",
  event: "events",
} as const satisfies Record<ActivityType, string>;

/**
 * The noun an **empty** dashboard is headed with.
 *
 * A dashboard with nothing on it has no noun of its own, so the page has to
 * pick one, and clubs is the default the rest of the product already assumes:
 * it is the standing weekly commitment, and the first heading on every populated
 * dashboard. Heading the empty page with it costs nothing if the first thing to
 * land turns out to be a camp — that reader then sees a single "Camps" section,
 * exactly as they would have either way — and it buys an empty dashboard that
 * still reads as the dashboard: a heading, a pill entry, and the same section
 * rhythm the page will have the moment something lands in it. The alternative,
 * an unheaded paragraph floating above whatever comes next, reads as a page that
 * failed to render rather than one with nothing in it yet.
 */
const EMPTY_DASHBOARD_ACTIVITY_TYPE: ActivityType = "club";

/**
 * The sections a type-noun dashboard is made of: one per noun that is actually
 * covered, or a single empty one when none is.
 *
 * Every dashboard that groups by noun reads its pill, its headings and its
 * bodies from this one list, so an empty dashboard cannot end up with a heading
 * the nav has no entry for — which is exactly what two copies of this arithmetic
 * eventually produce.
 */
export function activityTypeSections<T>(
  items: readonly T[],
  productTypeOf: (item: T) => ProductType,
): ActivityGroup<T>[] {
  const groups = groupByActivityType(items, productTypeOf);
  return groups.length === 0
    ? [{ type: EMPTY_DASHBOARD_ACTIVITY_TYPE, items: [] }]
    : groups;
}
