import type { LocationType } from "@/types";

/**
 * An ancestor chain with the country dropped.
 *
 * Every chain this codebase hands around ends at the country row, and almost
 * nothing that renders a path wants it: a breadcrumb above a browse list
 * already says which country is open, a grouped header sits inside one, and a
 * selected-place line reads better as "Uusimaa · Helsinki" than as a sentence
 * ending in the obvious. Filtering by *type* rather than by position is what
 * makes it right in every country at once — France's extra `district` level
 * would otherwise move the country's index.
 */
export function withoutCountry<T extends { type: LocationType }>(
  chain: readonly T[],
): T[] {
  return chain.filter((node) => node.type !== "country");
}
