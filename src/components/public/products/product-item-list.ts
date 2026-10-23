import type { SupportedLocale } from "@/lib/constants/locales";
import { inLocaleOrder } from "@/lib/i18n/locale-order";
import { resolveRequiredTranslation } from "@/lib/i18n/resolve-translation";
import { translatedCanonicalPath } from "@/lib/metadata/translated-page";
import { productPagePath } from "@/lib/products/product-metadata";
import type { ProductBrowseRow } from "@/types";

/**
 * **Shop products as a schema.org `ItemList`** — the shop grid's structured
 * data, and a landing page's products section's — or null when no product
 * would be listed.
 *
 * It tells a crawler that a page holds a list of specific things and what each
 * one is called. It is deliberately *not* a set of `Product` nodes: a
 * product's price, availability and schedule are all live state, and a stale
 * offer in search results is worse than none. Each product's full markup
 * stays on its own page.
 *
 * **A list item carries its position, its name and its page's URL.** The
 * caller passes rows the shop lists — its listing, or a selection of it — and
 * a listed product's page is promoted (tier 1 in the "Found" part of
 * `docs/architecture/site-quality.md`), so every URL here is a page a crawler
 * may index. That is the caller's obligation and the only thing keeping an
 * unlisted, ended or schools product out, so no filter is repeated here: a
 * second copy of the listing's rule would drift. The URL is the product page's
 * canonical — by the rule every page written per locale follows
 * (`src/lib/metadata/translated-page.ts`), the address of the locale whose
 * words the page shows at `locale` — so a list item never points at a page
 * that canonicalises somewhere else.
 *
 * Names resolve exactly the way a browse card's title does — through the
 * shared translation resolver, so a product with no translation in this locale
 * falls back the same way the visible card does. No products is nothing at
 * all rather than an empty list, which would assert that nothing is on offer.
 */
export function productItemList(
  products: readonly ProductBrowseRow[],
  locale: SupportedLocale,
  siteUrl: string,
) {
  const items = products.map((product) => {
    const written = inLocaleOrder(product.product_translations);
    return {
      name: resolveRequiredTranslation(written, locale).name,
      url: `${siteUrl}${translatedCanonicalPath(
        written,
        locale,
        productPagePath(product.id),
      )}`,
    };
  });

  if (items.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map(({ name, url }, index) => ({
      "@type": "ListItem",
      // 1-based, which is what schema.org's `position` means — the first item
      // in a list is at position 1, not 0.
      position: index + 1,
      name,
      url,
    })),
  };
}
