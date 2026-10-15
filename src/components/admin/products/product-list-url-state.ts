import { ADMIN_LIST_SEARCH_PARAM } from "@/components/admin/admin-list-url-state";
import { PRODUCT_LIST_TYPE_PARAM } from "@/lib/products/admin-product-list-type";
import type { EmbeddedLocationNode } from "@/lib/locations/embedded-chain";
import type { ProductListFacetsRow } from "@/services/products";
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

/**
 * The filter params a type switch decides about. The search is not one of
 * them: it applies under every type, so a switch never touches it.
 */
export type ProductListFilterParams = Record<
  "day" | "gedu" | "language" | "municipality",
  string | null
>;

/** The facet rows a type chip covers: its own, or every type's for `null`. */
function facetsUnder(
  facets: readonly ProductListFacetsRow[],
  type: ProductType | null,
): readonly ProductListFacetsRow[] {
  return type === null
    ? facets
    : facets.filter((row) => row.product_type === type);
}

/** How many products each type chip stands for, whatever the filters say. */
export function productListCount(
  facets: readonly ProductListFacetsRow[],
  type: ProductType | null,
): number {
  return facetsUnder(facets, type).reduce(
    (sum, row) => sum + row.product_count,
    0,
  );
}

/**
 * The values each filter can offer under a type (`null` for every type): the
 * ones present on that type's products, as the server's facets report them,
 * and none at all for a filter the type does not offer. Each control's options
 * are built from these, so a selection always matches at least one row.
 */
export function productListOptionValues(
  facets: readonly ProductListFacetsRow[],
  type: ProductType | null,
): Record<keyof ProductListFilterParams, Set<string>> {
  const offer = productListFilterOffer(type);
  const values = {
    day: new Set<string>(),
    gedu: new Set<string>(),
    language: new Set<string>(),
    municipality: new Set<string>(),
  };
  for (const row of facetsUnder(facets, type)) {
    for (const id of row.gedu_ids) values.gedu.add(id);
    if (offer.day) for (const w of row.weekdays) values.day.add(String(w));
    if (offer.language)
      for (const code of row.spoken_language_codes) values.language.add(code);
    if (offer.municipality)
      for (const muni of row.municipalities) values.municipality.add(muni.id);
  }
  return values;
}

/**
 * The municipalities a type's products sit in, once each — what the
 * municipality filter's options are labelled from.
 */
export function productListMunicipalities(
  facets: readonly ProductListFacetsRow[],
  type: ProductType | null,
): EmbeddedLocationNode[] {
  const byId = new Map<string, EmbeddedLocationNode>();
  for (const row of facetsUnder(facets, type)) {
    for (const muni of row.municipalities) byId.set(muni.id, muni);
  }
  return [...byId.values()];
}

/**
 * The filter params that survive a switch to `nextType`: each one is kept only
 * while the new type's control offers its value, and cleared otherwise — a
 * filter the type does not offer, or a value none of its products carries.
 *
 * Clearing is what keeps a hidden filter out of the URL. A day picked under
 * consumer clubs, kept across a switch to municipality clubs with no club on
 * that day, would read there as "all days" and then come back on switching
 * back, narrowing a list nobody had narrowed. A value still in range is kept:
 * a gedu who teaches both types stays selected.
 */
export function productListParamsAfterTypeSwitch(
  facets: readonly ProductListFacetsRow[],
  nextType: ProductType | null,
  current: ProductListFilterParams,
): ProductListFilterParams {
  const values = productListOptionValues(facets, nextType);
  const keep = (key: keyof ProductListFilterParams) => {
    const value = current[key];
    return value !== null && values[key].has(value) ? value : null;
  };
  return {
    day: keep("day"),
    gedu: keep("gedu"),
    language: keep("language"),
    municipality: keep("municipality"),
  };
}
