import { ADMIN_LIST_SEARCH_PARAM } from "@/components/admin/admin-list-url-state";

/**
 * The params the admin product lists mirror their narrowing into, through the
 * shared hooks in `admin-list-url-state.ts`. The search is every admin list's
 * `?q=`; the filters are the product lists' own.
 */
export const PRODUCT_LIST_PARAMS = {
  search: ADMIN_LIST_SEARCH_PARAM,
  day: "day",
  gedu: "gedu",
  language: "lang",
  municipality: "muni",
} as const;

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
