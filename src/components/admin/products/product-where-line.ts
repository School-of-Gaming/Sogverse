import {
  municipalityOf,
  type EmbeddedLocation,
} from "@/lib/locations/embedded-chain";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { joinParts } from "./join-parts";
import type { ProductType } from "@/types";

/**
 * The columns the "where" line reads. Both product queries embed the location
 * plus one level of parent, so the admin list row and the admin detail row
 * satisfy this shape unchanged — the line is derived from data already in
 * flight and reads the locations table not at all.
 */
export interface ProductWhereSource {
  product_type: ProductType;
  is_remote: boolean;
  locations: EmbeddedLocation | null;
}

/**
 * One short line naming where a product happens: a school hall and the town it
 * stands in, or the fact that it meets in a voice room.
 *
 * **A municipality club always names its municipality, online or not.** The tie
 * is to the Finnish kunta that funds it rather than to a building, so "Online"
 * on its own would drop the single most identifying fact about the row — and an
 * admin scanning for Espoo's clubs would find only the ones that meet in a
 * school hall. Every other type is a place or it is remote, never both: an
 * online camp is just online, and naming a town for it would invent a tie the
 * product does not have.
 *
 * `null` is a real answer — an in-person product with no location set has
 * nothing to say here, and the caller renders no chip rather than an em dash
 * standing in for a fact nobody entered.
 *
 * The online label is passed in rather than translated here so this stays a
 * pure function the unit tests can drive without a locale provider.
 */
export function productWhereLine(
  product: ProductWhereSource,
  locale: string,
  onlineLabel: string,
): string | null {
  const municipality = municipalityOf(product.locations);
  const municipalityName =
    municipality === null ? null : localizedLocationName(municipality, locale);

  if (product.is_remote) {
    return product.product_type === "municipality_club"
      ? joinParts([onlineLabel, municipalityName])
      : onlineLabel;
  }

  const site = product.locations;
  if (site === null) return null;

  // A club anchored at the municipality row itself would otherwise read
  // "Espoo · Espoo": the site and the municipality are one node, so the second
  // part is dropped rather than repeated.
  return joinParts([
    localizedLocationName(site, locale),
    municipality !== null && municipality.id !== site.id ? municipalityName : null,
  ]);
}
