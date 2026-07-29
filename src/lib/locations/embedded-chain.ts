import type { Json, LocationType } from "@/types";

/**
 * Reading a product's place off the row it already came with.
 *
 * Both product queries embed the location a product points at plus one level of
 * parent, and that is deliberately enough: the schema allows exactly two shapes
 * for a municipality club — the municipality itself (online) or a site directly
 * under it (in-person) — so the municipality is always at depth 0 or 1. Deriving
 * it here rather than from a locations lookup is what keeps the surfaces that
 * group clubs by municipality from having to read the locations table at all.
 */

/** One node of the embed — the columns a name and a chain step need. */
export interface EmbeddedLocationNode {
  id: string;
  name: string;
  name_i18n: Json | null;
  type: LocationType;
}

export interface EmbeddedLocation extends EmbeddedLocationNode {
  parent: EmbeddedLocationNode | null;
}

/**
 * The municipality a product sits in, or `null` when it sits in none.
 *
 * `null` is a real answer, not a failure: a club anchored to a region or a
 * country (legacy data the DB trigger still permits) has no municipality, and
 * availability is municipality-exact with no cascade — a région-scoped club
 * must not light up every commune under it.
 */
export function municipalityOf(
  location: EmbeddedLocation | null | undefined,
): EmbeddedLocationNode | null {
  if (!location) return null;
  if (location.type === "municipality") return location;
  if (location.parent?.type === "municipality") return location.parent;
  return null;
}
