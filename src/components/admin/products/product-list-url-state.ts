import { ADMIN_LIST_SEARCH_PARAM } from "@/components/admin/admin-list-url-state";
import { PRODUCT_LIST_TYPE_PARAM } from "@/lib/products/admin-product-list-type";
import type { ProductType } from "@/types";

/**
 * The params the admin product list mirrors its narrowing into, through the
 * shared hooks in `admin-list-url-state.ts`. The search is every admin list's
 * `?q=`; the type and the filters are the product list's own.
 */
export const PRODUCT_LIST_PARAMS = {
  search: ADMIN_LIST_SEARCH_PARAM,
  type: PRODUCT_LIST_TYPE_PARAM,
  day: "day",
  gedu: "gedu",
  language: "lang",
  municipality: "muni",
} as const;

/**
 * Which of the type-specific filters the list offers, given the type chip.
 * Search and gedu are offered whatever the type, so they are not listed.
 *
 *   consumer club      day, language
 *   municipality club  day, municipality
 *   camp / event       neither
 *   every type         neither
 *
 * A weekday narrows only a schedule that repeats weekly: a camp runs its days
 * back to back and an event happens once, so there the control could only
 * restate the dates already on the rows. Under every type it is withheld too,
 * because picking a day there would silently drop every camp and event.
 */
export interface ProductListFilterOffer {
  day: boolean;
  language: boolean;
  municipality: boolean;
}

export function productListFilterOffer(
  type: ProductType | null,
): ProductListFilterOffer {
  return {
    day: type === "consumer_club" || type === "municipality_club",
    language: type === "consumer_club",
    municipality: type === "municipality_club",
  };
}

/**
 * A stored param value, but only while it still names something the control can
 * offer.
 *
 * A bookmarked or hand-edited URL outlives the data it points at: a gedu leaves,
 * a municipality's last club is retired, and the id in the query string now
 * matches no option. Falling back to "all" is the honest answer — the
 * alternative is a filter trigger displaying a raw UUID and a list narrowed to
 * nothing, with no way to tell which of the two happened.
 */
export function optionInRange(
  options: readonly { value: string }[],
  value: string | null,
): string | null {
  if (value === null) return null;
  return options.some((option) => option.value === value) ? value : null;
}
