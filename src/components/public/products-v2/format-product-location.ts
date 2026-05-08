import type { ProductV2BrowseRow } from "@/types";

// Resolve the location strings the parent-facing card and detail page
// render. The schema invariants (validate_products_v2_location trigger,
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

export function formatProductLocation(
  product: Pick<ProductV2BrowseRow, "is_remote" | "product_type" | "locations">,
): ProductLocationDisplay | null {
  const loc = product.locations;
  if (!loc) return null;

  if (!product.is_remote) {
    return { kind: "site", site: loc.name, parent: loc.parent?.name ?? null };
  }

  if (product.product_type === "municipality_club") {
    return { kind: "muni", name: loc.name };
  }

  return null;
}
