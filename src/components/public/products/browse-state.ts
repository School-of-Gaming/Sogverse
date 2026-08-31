import { CATEGORY_PARAM } from "./shop-categories";

// The browse surfaces' URL vocabulary, and the one place it is spelled.
//
// These names were private to `use-browse-filters.ts` until the detail page
// needed to read them back: a card link carries the grid's filter state into
// `/shop/[id]`, and the back link rebuilds the listing URL from it. Two readers
// means the names stop being one hook's implementation detail — a second copy
// would let a rename fix the grid and silently break the return trip, which is
// exactly the kind of drift a shared constant costs nothing to prevent.
export const TOPIC_PARAM = "topic";
export const FORMAT_PARAM = "format";
export const LANGUAGE_PARAM = "lang";
export const AUDIENCE_PARAM = "audience";
export const TAG_PARAM = "tag";
export const AGE_PARAM = "age";
export const DAYS_PARAM = "days";

/**
 * Says the detail page was opened from a browse grid rather than reached cold.
 *
 * It carries no filter state of its own and exists purely to separate the two
 * cases the filter params cannot: a reader who was on an *unfiltered* `/shop`
 * and one who arrived from a search engine or a shared link both present zero
 * filter params, and they want opposite things from the back link. Without this
 * marker the unfiltered browser is sent to the type's listing — a category they
 * never selected — which is the bug this whole mechanism exists to fix.
 */
export const FROM_PARAM = "from";
/** The only value `FROM_PARAM` ever takes; compared, never parsed. */
export const FROM_BROWSE = "browse";

/**
 * Every param that is part of "how the grid was filtered", in the order a
 * carried URL spells them — fixed so the same filter state always produces the
 * same string rather than one per tap order.
 *
 * `category` rides along with the chip filters even though a different hook
 * owns it: the Type row is an ordinary filter to the reader, and a back link
 * that restored the chips but dropped the Type selection would be a subtler
 * version of the same complaint.
 */
const BROWSE_STATE_PARAMS = [
  CATEGORY_PARAM,
  TOPIC_PARAM,
  FORMAT_PARAM,
  LANGUAGE_PARAM,
  AUDIENCE_PARAM,
  TAG_PARAM,
  AGE_PARAM,
  DAYS_PARAM,
] as const;

/**
 * The filter half of a browse URL, as a query string with no leading `?`.
 *
 * An allow-list rather than a copy of the whole query: only these names travel,
 * so nothing else a URL happens to carry is propagated into a link we emit.
 * The *values* are passed through unvalidated on purpose — every one of them is
 * re-parsed by the filter hook on arrival, which already drops anything it does
 * not recognise, so validating here would be a second, driftable copy of rules
 * that are enforced where they matter.
 */
export function browseStateQuery(source: URLSearchParams): string {
  const params = new URLSearchParams();
  for (const name of BROWSE_STATE_PARAMS) {
    const value = source.get(name);
    if (value) params.set(name, value);
  }
  return params.toString();
}

/**
 * A card's detail-page href with the grid's filter state stapled on, so the
 * page it opens can find its way back to the grid as the reader left it.
 *
 * The marker goes on whether or not any filter did — an unfiltered grid is
 * still a grid that was navigated from.
 */
export function withBrowseState(href: string, source: URLSearchParams): string {
  const params = new URLSearchParams(browseStateQuery(source));
  params.set(FROM_PARAM, FROM_BROWSE);
  return `${href}?${params.toString()}`;
}

/**
 * Rebuild a listing URL from the state a detail page is carrying.
 *
 * `base` is always a literal route from `ROUTES`, never anything the caller
 * supplied, so this cannot become an open redirect and deliberately does not
 * reach for `resolveInternalPath()`: no path arrives from the URL here, only
 * known filter names whose values are re-validated by the listing that reads
 * them.
 */
export function listingHrefWithBrowseState(
  base: string,
  source: URLSearchParams,
): string {
  const qs = browseStateQuery(source);
  return qs ? `${base}?${qs}` : base;
}

/** Whether this page was opened from a browse grid — see `FROM_PARAM`. */
export function cameFromBrowse(source: URLSearchParams): boolean {
  return source.get(FROM_PARAM) === FROM_BROWSE;
}
