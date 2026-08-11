import type { ProductBrowseRow } from "@/types";

// Who a product is sold to, collapsed from the two independent booleans the
// database carries into the one value every family-facing surface actually
// renders. A CHECK guarantees at least one flag is set, so the three cases
// below are exhaustive over real rows — the `for_parents` test leads so a row
// that somehow carried neither flag falls out as `gamers`, which is what every
// product was before audiences existed.
//
// This is deliberately the only place the two columns are read together. The
// browse card, the overview card and the filter chips all speak in these three
// words, so widening the vocabulary later is one edit rather than three.

export type ProductAudience = "gamers" | "parents" | "both";

/** The filter's own vocabulary: a chip names one audience, never "both". */
export type AudienceFilterValue = "gamers" | "parents";

export const AUDIENCE_FILTER_VALUES: readonly AudienceFilterValue[] = [
  "gamers",
  "parents",
];

export function isAudienceFilterValue(v: string): v is AudienceFilterValue {
  return v === "gamers" || v === "parents";
}

export function productAudience(
  product: Pick<ProductBrowseRow, "for_gamers" | "for_parents">,
): ProductAudience {
  if (!product.for_parents) return "gamers";
  return product.for_gamers ? "both" : "parents";
}

/**
 * Whether a product answers a chip selection, with OR semantics across the
 * selected chips — the same shape the topic and language rows use. A mixed
 * product answers to either chip, which is the whole reason the filter reads
 * the two columns rather than the collapsed audience above.
 */
export function matchesAudienceFilter(
  product: Pick<ProductBrowseRow, "for_gamers" | "for_parents">,
  selected: readonly AudienceFilterValue[],
): boolean {
  if (selected.length === 0) return true;
  return selected.some((value) =>
    value === "gamers" ? product.for_gamers : product.for_parents,
  );
}
