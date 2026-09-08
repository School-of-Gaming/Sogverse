import {
  matchesProductSearch,
  normalizeProductSearch,
  type ProductNameSearchSource,
} from "./product-name-search";

/**
 * The club narrowing rule: name search AND weekday AND educator AND spoken
 * language, every one of them optional.
 *
 * **Pure, and shared by two surfaces that must narrow identically.** The admin
 * club list page owns the filter bar; the club switch's picker offers the same
 * four controls over the same rows, and an admin who has learned what "Tuesday
 * + English" means on one page must not meet a second, subtly different answer
 * on the other. So the predicate lives here, with the controls and the state
 * left to each surface — the list page keeps its selections in the query
 * string, the picker holds them for as long as it is open.
 *
 * The municipality filter is deliberately absent: it applies to municipality
 * clubs alone, needs the row's embedded location chain resolved first, and the
 * picker never offers it. The list page applies it beside this call.
 */

/** The columns the predicate reads; the admin list row satisfies it unchanged. */
export interface ClubFilterableProduct extends ProductNameSearchSource {
  schedule_slots: readonly { weekday: number }[];
  gedu_group_assignments: readonly { gedu_id: string }[];
  spoken_language_code: string;
}

/** A selection of `null` means "all" — that filter does not narrow anything. */
export interface ClubFilterCriteria {
  /** Raw text as typed; normalized here, so callers pass the box's value. */
  search: string;
  /** 0=Mon..6=Sun, matched against any of the club's weekly slots. */
  weekday: number | null;
  /** Matched against any educator assigned to any group on the club. */
  geduId: string | null;
  /** A `spoken_language` code, matched against the club's own. */
  language: string | null;
}

/**
 * Whether one club survives every active filter. `needle` must already have
 * been through `normalizeProductSearch` — the caller normalizes once for the
 * whole list rather than per row.
 */
function matchesClubFilters(
  product: ClubFilterableProduct,
  criteria: ClubFilterCriteria,
  needle: string,
): boolean {
  if (!matchesProductSearch(product, needle)) return false;
  if (
    criteria.weekday !== null &&
    !product.schedule_slots.some((slot) => slot.weekday === criteria.weekday)
  ) {
    return false;
  }
  if (
    criteria.geduId !== null &&
    !product.gedu_group_assignments.some((a) => a.gedu_id === criteria.geduId)
  ) {
    return false;
  }
  if (
    criteria.language !== null &&
    product.spoken_language_code !== criteria.language
  ) {
    return false;
  }
  return true;
}

/** The clubs the criteria leave standing, in their original order. */
export function filterClubProducts<T extends ClubFilterableProduct>(
  products: readonly T[],
  criteria: ClubFilterCriteria,
): T[] {
  const needle = normalizeProductSearch(criteria.search);
  return products.filter((product) =>
    matchesClubFilters(product, criteria, needle),
  );
}
