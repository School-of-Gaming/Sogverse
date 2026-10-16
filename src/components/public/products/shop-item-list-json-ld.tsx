import { JsonLd } from "@/components/seo/json-ld";
import { resolveLocale } from "@/lib/constants/locales";
import type { ProductBrowseRow } from "@/types";
import { productItemList } from "./product-item-list";

interface ShopItemListJsonLdProps {
  /**
   * The rows the shop grid is about to render — the storefront prefetch's
   * result, nothing else.
   *
   * **This prop is what keeps unlisted, ended and schools products out of the
   * structured data, and it is the only thing that does.** Only the shop's
   * listing ever reaches the browse grid: an unlisted product is reachable by
   * direct link and must never be *promoted*, and a municipality club is
   * offered to families in one municipality. All of them are excluded by the
   * query that produces these rows, so the list adds no filter of its own — a
   * filter there would be a second, weaker copy of that rule, and the failure
   * mode of a second copy is that it drifts. The obligation this places on a
   * caller is exact: pass the browse rows, never a wider product list, because
   * every row here is given its page's URL.
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
 * The shop grid, as an `ItemList` of the products on it (`productItemList`
 * says what a list item carries and why it is not a `Product`).
 *
 * The card's own link stays at the shop's locale, for the reader; the list
 * item's URL is the product page's canonical.
 *
 * Nothing at all rather than an empty `ItemList`. The shop page's prefetch
 * catches its own failure and hands the grid `[]` while the client refetches,
 * so an empty list here would assert "nothing is on offer" over a grid showing
 * dozens — exactly what the doc's "a structured data block reads the same
 * source as the visible page" rule exists to prevent.
 */
export function ShopItemListJsonLd({ products, locale: requestLocale }: ShopItemListJsonLdProps) {
  const itemList = productItemList(
    products,
    resolveLocale(requestLocale),
    process.env.NEXT_PUBLIC_SITE_URL ?? "",
  );
  return itemList === null ? null : <JsonLd data={itemList} />;
}
