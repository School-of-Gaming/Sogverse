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

/**
 * The filter's own vocabulary — and the badge's, which is the point: a chip is
 * a *tag*, matching exactly the products that wear it, so "For parents" and
 * "For families" name the two audience shapes that carry a label and nothing
 * else. Gamers-only is the assumed default: no chip, no badge, and therefore no
 * value here.
 */
export type AudienceFilterValue = "parents" | "families";

export const AUDIENCE_FILTER_VALUES: readonly AudienceFilterValue[] = [
  "parents",
  "families",
];

export function isAudienceFilterValue(v: string): v is AudienceFilterValue {
  return v === "parents" || v === "families";
}

export function productAudience(
  product: Pick<ProductBrowseRow, "for_gamers" | "for_parents">,
): ProductAudience {
  if (!product.for_parents) return "gamers";
  return product.for_gamers ? "both" : "parents";
}

/**
 * The `productAudience.*` message key a surface labels a product with, or
 * null for the audience that deliberately gets no label. `gamers` is what
 * every product was before audiences existed, so a label there would spend a
 * badge marking the absence of news — while on a parents-only surface the
 * label is the only audience signal, since no age line renders (an adult
 * range like "18+" was rejected as saying something else entirely). A product
 * for both is `families`, the one UI word for the two-flag shape.
 *
 * The returned key is also the chip value that matches this product, and that
 * identity is the chip-equals-tag rule made structural: the filter below reads
 * this same function, so a badge and the chip that surfaces it cannot drift.
 * The badge-or-nothing decision living here is what keeps the browse card, the
 * overview card and the style-guide grid in step; the literal keys stay
 * greppable at the filter chip row, which names them one by one.
 */
export function audienceLabelKey(
  product: Pick<ProductBrowseRow, "for_gamers" | "for_parents">,
): AudienceFilterValue | null {
  switch (productAudience(product)) {
    case "gamers":
      return null;
    case "parents":
      return "parents";
    case "both":
      return "families";
  }
}

/**
 * Whether a product answers a chip selection, with OR semantics across the
 * selected chips — the same shape the topic and language rows use. What is
 * unlike those rows is that a chip matches the products bearing *that* tag and
 * only those: "For parents" keeps parents-only products, "For families" keeps
 * the both-audience ones, and neither keeps a gamers-only product, which wears
 * no tag at all.
 *
 * So lighting both chips is not the same as lighting none: it is every
 * non-gamers-only product, which is a *narrower* set than the unfiltered grid.
 * The only way back to everything is clearing the row.
 */
export function matchesAudienceFilter(
  product: Pick<ProductBrowseRow, "for_gamers" | "for_parents">,
  selected: readonly AudienceFilterValue[],
): boolean {
  if (selected.length === 0) return true;
  const tag = audienceLabelKey(product);
  return tag !== null && selected.includes(tag);
}
