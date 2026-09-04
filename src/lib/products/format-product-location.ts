import type { Json, ProductType } from "@/types";
import { localizedLocationName } from "@/lib/locations/localized-name";

// Resolve the location strings the parent-facing card and detail page
// render. The schema invariants (validate_products_location trigger,
// migration 00030) constrain what's possible:
//
//   - In-person (any type): location_id required, must be type='site'.
//   - Online municipality_club: location_id required, type ∈
//     {country, region, municipality} (NEVER site).
//   - Online non-muni: location_id must be NULL.
//
// Three return shapes:
//   - { kind: "site", site, parent }   in-person
//   - { kind: "muni", name }            online municipality_club
//   - null                              online non-muni, or join missing
//
// `null` lets the caller fall back to its own copy (e.g. info.online or
// info.tbd) without having to re-derive the variant.

export type ProductLocationDisplay =
  | { kind: "site"; site: string; parent: string | null }
  | { kind: "muni"; name: string };

/**
 * The structural subset of a joined location row this rule reads.
 *
 * Spelled out rather than `Pick`ed off the browse row, because the callers are
 * no longer one query's shape: the browse and detail reads embed a location
 * with its id and type, and the signup confirmation's mail read embeds the two
 * name columns and nothing else. A structural parameter is what lets one rule
 * serve both without either query having to fetch columns it has no use for.
 */
export interface ProductLocationRowSubset {
  name: string;
  name_i18n: Json | null;
  /**
   * The site's municipality, or `null` for a row that has none.
   *
   * **Required-and-nullable rather than optional, deliberately.** A caller that
   * forgot the `parent` join and one whose row genuinely has no parent look
   * identical to an optional field, and the two mean opposite things: the
   * second is a site with no municipality to name, the first is a site whose
   * municipality we have and failed to fetch. Making the key mandatory turns
   * the forgotten join into a compile error instead of a "Where" line that
   * silently drops the municipality a reader was looking for.
   */
  parent: { name: string; name_i18n: Json | null } | null;
}

export interface ProductLocationSubject {
  is_remote: boolean;
  product_type: ProductType;
  locations: ProductLocationRowSubset | null;
}

export function formatProductLocation(
  product: ProductLocationSubject,
  locale: string,
): ProductLocationDisplay | null {
  const loc = product.locations;
  if (!loc) return null;

  if (!product.is_remote) {
    return {
      kind: "site",
      site: localizedLocationName(loc, locale),
      parent: loc.parent ? localizedLocationName(loc.parent, locale) : null,
    };
  }

  if (product.product_type === "municipality_club") {
    return { kind: "muni", name: localizedLocationName(loc, locale) };
  }

  return null;
}

/**
 * The one line a surface prints for "where", from that display shape and the
 * two pieces of copy the null case falls back to.
 *
 * It lives here rather than beside either surface because the confirmation page
 * and the mail that mirrors it have to say the same words about the same
 * product — a site with its parent joined by a comma, a municipality on its
 * own, "Online" for a remote product with no municipality behind it, and "to be
 * confirmed" for one whose place is not settled. Two copies of that rule would
 * be two answers the first time one of them was corrected.
 *
 * The two fallbacks arrive already translated, in whichever namespace the
 * caller's translator reaches, because this module has none of its own.
 */
export function renderProductLocationLine({
  location,
  isRemote,
  online,
  tbd,
}: {
  location: ProductLocationDisplay | null;
  isRemote: boolean;
  /** Already-translated "Online". */
  online: string;
  /** Already-translated "To be confirmed". */
  tbd: string;
}): string {
  if (!location) return isRemote ? online : tbd;
  switch (location.kind) {
    case "site":
      return location.parent ? `${location.site}, ${location.parent}` : location.site;
    case "muni":
      return location.name;
  }
}

/**
 * Which of the two labels that line wears — "Format" for a genuinely remote
 * product, "Where" for one with a place behind it.
 *
 * A municipality club is remote *and* names a municipality, and it takes
 * "Where": the value is a place, so a label reading "Format" would be answering
 * a different question than the value does.
 */
export function productLocationLabelIsFormat(
  isRemote: boolean,
  location: ProductLocationDisplay | null,
): boolean {
  return isRemote && location?.kind !== "muni";
}
