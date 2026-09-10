import { getPathname } from "@/i18n/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { ROUTES } from "@/lib/constants";
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
 * It tells a crawler that this page is a list of specific, linkable things and
 * what each one is called — which is what lets a product a family searched for
 * be reached through its own page rather than through the grid. It is
 * deliberately *not* a set of `Product` nodes: a product's price, availability
 * and schedule are all live state, and a stale offer in search results is worse
 * than none.
 *
 * Names resolve exactly the way a browse card's title does — through the
 * shared translation resolver, so a product with no translation in this locale
 * falls back the same way the visible card does rather than appearing under a
 * different name in the structured data than on the page. URLs go through the
 * route builder and `getPathname`, so a translated slug edited in the pathnames
 * map moves both.
 */
export function ShopItemListJsonLd({ products, locale: requestLocale }: ShopItemListJsonLdProps) {
  const locale = resolveLocale(requestLocale);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.map((product, index) => ({
      "@type": "ListItem",
      // 1-based, which is what schema.org's `position` means — the first item
      // in a list is at position 1, not 0.
      position: index + 1,
      name: resolveTranslation(product.product_translations, locale)?.name ?? "",
      url: `${siteUrl}${getPathname({ href: ROUTES.shopProduct(product.id), locale })}`,
    })),
  };

  return <JsonLd data={itemList} />;
}
