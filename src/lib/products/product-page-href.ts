import { ROUTES, type AppHref } from "@/lib/constants/routes";
import { municipalityOf, type EmbeddedLocation } from "@/lib/locations/embedded-chain";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { municipalitySlug } from "@/lib/locations/municipality-slug";
import type { ProductType } from "@/types";

/**
 * **Where a family opens a product's page, at a locale** — the address a card
 * links to when the surface showing it has no address of its own to give.
 *
 * Every type but one has its page in the shop. A municipality club is not in
 * the shop: families find it on its town's `/schools/<slug>` page, and its own
 * page sits under that slug, so its card links there — the address its card on
 * the town's page opens, with the slug that page's list links with, derived
 * from the town's name in the reader's locale (a Swedish reader is sent to
 * `helsingfors`, a Finnish one to `helsinki`; both resolve to the one town). A
 * municipality club with no town to name — a state its CHECK forbids — falls
 * back to the shop address, which still opens its page.
 */
export function productPageHref(
  product: {
    id: string;
    product_type: ProductType;
    locations: EmbeddedLocation | null;
  },
  locale: string,
): AppHref {
  if (product.product_type === "municipality_club") {
    const municipality = municipalityOf(product.locations);
    if (municipality !== null) {
      return ROUTES.schoolMunicipalityProduct(
        municipalitySlug(localizedLocationName(municipality, locale)),
        product.id,
      );
    }
  }
  return ROUTES.shopProduct(product.id);
}
