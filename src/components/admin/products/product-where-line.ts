import {
  municipalityOf,
  type EmbeddedLocation,
} from "@/lib/locations/embedded-chain";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { gamersAttendSite } from "@/lib/products/delivery-mode";
import { joinParts } from "./join-parts";
import type { DeliveryMode, ProductType } from "@/types";

/**
 * The columns the "where" line reads. Both product queries embed the location
 * plus one level of parent, so the admin list row and the admin detail row
 * satisfy this shape unchanged — the line is derived from data already in
 * flight and reads the locations table not at all.
 */
export interface ProductWhereSource {
  product_type: ProductType;
  delivery_mode: DeliveryMode;
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
 * school hall. Every other online type is just online: an online camp is just
 * online, and naming a town for it would invent a tie the product does not
 * have.
 *
 * **A hybrid product names its site and then says it is hybrid**, because both
 * halves are true of it: the gamers meet at the site and the gedu is in the
 * voice room.
 *
 * `null` is a real answer — an in-person product with no location set has
 * nothing to say here, and the caller renders no chip rather than an em dash
 * standing in for a fact nobody entered.
 *
 * The labels are passed in rather than translated here so this stays a pure
 * function the unit tests can drive without a locale provider.
 */
export function productWhereLine(
  product: ProductWhereSource,
  locale: string,
  labels: { online: string; hybrid: string },
): string | null {
  const municipality = municipalityOf(product.locations);
  const municipalityName =
    municipality === null ? null : localizedLocationName(municipality, locale);

  if (!gamersAttendSite(product.delivery_mode)) {
    return product.product_type === "municipality_club"
      ? joinParts([labels.online, municipalityName])
      : labels.online;
  }

  const site = product.locations;
  if (site === null) return null;

  // A club anchored at the municipality row itself would otherwise read
  // "Espoo · Espoo": the site and the municipality are one node, so the second
  // part is dropped rather than repeated.
  return joinParts([
    localizedLocationName(site, locale),
    municipality !== null && municipality.id !== site.id ? municipalityName : null,
    product.delivery_mode === "hybrid" ? labels.hybrid : null,
  ]);
}
