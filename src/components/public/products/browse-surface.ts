import { EMPTY_FILTERS, type BrowseFilters } from "./filter-products";
import type { ShopCategory } from "./shop-categories";

// Which filters a browse surface offers, and the one place that is decided.
//
// Two pages render the shared browse body — the shop, and a school's own page
// of municipality clubs — and they do not offer the same filters. What a
// surface does not offer has to be absent everywhere at once: the row is not
// drawn, the param is not applied to the grid, and it counts toward nothing the
// filter bar shows. A param is still *read* from the URL on every surface,
// because the URL is shared — a shop link carrying `?audience=parents` can be
// edited into a school page's address — so each of those three readers used to
// need its own guard, and one of them lacking it is how a school page came to
// empty its grid under a Clear button with no filter on screen to explain it.
// Every reader asks this module instead.

/** A page that renders the browse body. */
export type BrowseSurface = "shop" | "municipality";

/** The grid's whole filter state: the chip filters, and the shop's Type
 *  selection, which lives in a param of its own but is an ordinary filter to
 *  the reader. */
export interface BrowseFilterState extends BrowseFilters {
  categories: ShopCategory[];
}

/** One filter, named by the state it reads — which is also the id of the row
 *  that draws it, so a row, the predicate input it feeds and the Clear
 *  condition are the same word and cannot be mapped onto each other wrongly. */
export type BrowseFilterKey = keyof BrowseFilterState;

const EMPTY_STATE: BrowseFilterState = { ...EMPTY_FILTERS, categories: [] };

/**
 * The filters each surface withholds. Everything not listed is offered.
 *
 * Listed as withheld rather than as offered so the reasons sit beside the
 * exceptions, which are the part that needs one.
 */
const WITHHELD: Record<BrowseSurface, readonly BrowseFilterKey[]> = {
  shop: [],
  municipality: [
    // Type and Audience have one answer here. Everything on a school page is
    // that school's own gamers-only club, and a filter with one answer
    // controls nothing (owner decision).
    "categories",
    "audiences",
    // Price has no answer here at all. A school's clubs are invoiced to the
    // municipality, so none of them states a price, and a product stating no
    // price answers neither chip — both would only ever empty the grid. That
    // is a fact about how school clubs are billed rather than a judgement
    // about the row, so it would stay true of any page listing them.
    "price",
    // Designed-for is deliberately NOT withheld: a tag is orthogonal to what
    // makes the rows above vacuous, and one school can offer a beginner club
    // beside a neuroinclusive one (owner decision, 2026-08-12).
  ],
};

/** Whether this surface draws, applies and counts the filter. */
export function offersFilter(
  surface: BrowseSurface,
  key: BrowseFilterKey,
): boolean {
  return !WITHHELD[surface].includes(key);
}

/**
 * The state as this surface applies it: every filter it withholds reads as
 * unset, whatever the URL says. This is what the grid is filtered by and what
 * decides whether Clear shows, so neither can act on a filter the reader has no
 * row to see.
 */
export function offeredFilterState(
  surface: BrowseSurface,
  state: BrowseFilterState,
): BrowseFilterState {
  const pick = <K extends BrowseFilterKey>(key: K): BrowseFilterState[K] =>
    offersFilter(surface, key) ? state[key] : EMPTY_STATE[key];
  return {
    categories: pick("categories"),
    topics: pick("topics"),
    format: pick("format"),
    price: pick("price"),
    languages: pick("languages"),
    audiences: pick("audiences"),
    tags: pick("tags"),
    age: pick("age"),
    days: pick("days"),
  };
}

/** Whether clearing this state would change anything. */
export function hasActiveFilters(state: BrowseFilterState): boolean {
  return (
    state.categories.length > 0 ||
    state.topics.length > 0 ||
    state.format !== null ||
    state.price !== null ||
    state.languages.length > 0 ||
    state.audiences.length > 0 ||
    state.tags.length > 0 ||
    state.age !== null ||
    state.days.length > 0
  );
}
