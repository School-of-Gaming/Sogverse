import type { ProductBrowseRow, UserRole } from "@/types";

// Who a product is sold to, collapsed from the two independent booleans the
// database carries into the one value every family-facing surface actually
// renders. A CHECK guarantees at least one flag is set, so the three cases
// below are exhaustive over real rows — the `for_parents` test leads so a row
// that somehow carried neither flag falls out as `gamers`, which is what every
// product was before audiences existed.
//
// This is meant to be the only place the two columns are read together, and
// currently is not: the family signup panel in `product-detail-page` still
// builds its selectable rows straight off `for_gamers` / `for_parents`, under a
// comment of its own claiming to be where the three cases are told apart. Both
// answer the same question — who may hold a seat — so a future change to the
// rule has two homes and a third since `audienceAdmitsRole` arrived below.
// Routing that panel through this module is the fix, and it is a small one;
// until it happens, treat this sentence as the intent rather than the state.
//
// The browse card, the overview card and the filter chips all speak in these
// three words, so widening the vocabulary later is one edit rather than three.

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
 * Whether a person of this role may occupy a seat on a product with this
 * audience: a `gamer` needs `for_gamers`, and a `customer` — an adult taking a
 * seat on their own account — needs `for_parents`. For those two roles this
 * restates exactly what the enrollment RPCs enforce, in both directions.
 *
 * **`admin` and `gedu` are refused here as a browser-side policy that no RPC
 * states**, which is worth knowing before trusting this as a mirror of the
 * server. The admin enrollment function branches on `customer` and sends every
 * other role down the parent-link path, so a linked staff profile is something
 * it would seat; the participation and waitlist functions do not consult role
 * at all. Nothing reaches that today — the only caller lists families, and a
 * family block holds none — so the strictness costs nobody an action. It is
 * spelled out rather than defaulted so a new role has to be answered for here.
 *
 * Written over the collapsed audience rather than the two columns, which keeps
 * this module the only place they are read together, and asked per role rather
 * than per product because that is the question every caller has: a picker
 * knows who a row is and wants to know whether to offer an action on them.
 *
 * A caller deciding this is choosing what to *offer*. The database refuses the
 * same tuple on its own and remains the authority — nothing here is a
 * substitute for that refusal.
 */
export function audienceAdmitsRole(
  audience: ProductAudience,
  role: UserRole,
): boolean {
  switch (role) {
    case "gamer":
      return audience === "gamers" || audience === "both";
    case "customer":
      return audience === "parents" || audience === "both";
    case "admin":
    case "gedu":
      return false;
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
