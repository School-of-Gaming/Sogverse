import { JsonLd } from "@/components/seo/json-ld";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type { ProductBrowseRow } from "@/types";

interface ShopItemListJsonLdProps {
  /**
   * The rows the shop grid is about to render — the storefront prefetch's
   * result, nothing else.
   *
   * **This prop is what keeps unlisted and schools products out of the
   * structured data, and it is the only thing that does.** Only shop-visible
   * products ever reach the browse grid: an unlisted product is reachable by
   * direct link and must never be *findable*, and a municipality club is
   * offered to families in one municipality rather than promoted. Both are
   * excluded by the query that produces these rows, so this component adds no
   * filter of its own — a filter here would be a second, weaker copy of that
   * rule, and the failure mode of a second copy is that it drifts. The
   * obligation this places on a caller is exact: pass the browse rows, never a
   * wider product list.
   */
  products: readonly ProductBrowseRow[];
  /**
   * The locale the page is being rendered at. Taken as a bare string and
   * narrowed here, because `getLocale()` is typed as one and the `[locale]`
   * layout has already validated the segment — the alternative is every call
   * site restating the same guard.
   */
  locale: string;
}

/**
 * The shop grid, as an `ItemList` of the products on it.
 *
 * It tells a crawler that this page is a list of specific things and what each
 * one is called. It is deliberately *not* a set of `Product` nodes: a
 * product's price, availability and schedule are all live state, and a stale
 * offer in search results is worse than none.
 *
 * **A list item carries its position and its name, and no `url`.** Every
 * product detail page is `noindex, nofollow` by posture (tier 2 in
 * `docs/architecture/discoverability.md`), so a URL here would advertise pages
 * a crawler is told it may not use. The URL comes back with the "index listed
 * product pages" backlog item, if that lands.
 *
 * Names resolve exactly the way a browse card's title does — through the
 * shared translation resolver, so a product with no translation in this locale
 * falls back the same way the visible card does rather than appearing under a
 * different name in the structured data than on the page. A row whose name
 * resolves to nothing is skipped rather than emitted under an empty one: a
 * `ListItem` with no `name` is an invalid `ListItem`.
 */
export function ShopItemListJsonLd({ products, locale: requestLocale }: ShopItemListJsonLdProps) {
  const locale = resolveLocale(requestLocale);

  const names = products
    .map((product) => resolveTranslation(product.product_translations, locale)?.name ?? "")
    .filter((name) => name.length > 0);

  // Nothing at all rather than an empty `ItemList`. The shop page's prefetch
  // catches its own failure and hands the grid `[]` while the client refetches,
  // so an empty list here would assert "nothing is on offer" over a grid
  // showing dozens — exactly what the doc's "a structured data block reads the
  // same source as the visible page" rule exists to prevent.
  if (names.length === 0) return null;

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: names.map((name, index) => ({
      "@type": "ListItem",
      // 1-based, which is what schema.org's `position` means — the first item
      // in a list is at position 1, not 0.
      position: index + 1,
      name,
    })),
  };

  return <JsonLd data={itemList} />;
}
