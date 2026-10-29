/**
 * The admin club-switch picker's free-text search: a product's ID, or a
 * case-insensitive substring of its name. (The admin product list asks the same
 * question of the server, as an `id` match or an `ilike` over every one of a
 * product's names.)
 *
 * **A search that is a whole product ID finds that product alone.** Whether it
 * is one is `productIdFromSearch`'s to say, the one function both searches ask,
 * so the picker and the list cannot disagree; names are not consulted then,
 * because a product named with that text is not the product the admin pasted.
 * Anything else is a name search.
 *
 * **Every locale's name is matched, not just the viewer's.** A product is
 * authored once and named in each locale it sells in, and the admin who created
 * it may well have typed the English name while reading the list in Finnish.
 * Matching only the resolved display name would make the same product findable
 * or not depending on who is looking, which is the opposite of what a search box
 * promises. Walking the translations covers the displayed name for free — it is
 * one of them.
 *
 * Plain `toLowerCase()` rather than the locale-aware variant: the runtime locale
 * of an admin's browser must not decide whether a row matches, and the two
 * differ only on Turkish dotted/dotless I, which no product name here turns on.
 * Accents are matched as typed — "Ähtäri" is found by "äht", not by "aht" —
 * because folding them would need a normalisation table this list has never
 * wanted.
 */

import { productIdFromSearch } from "@/lib/products/product-id-search";

/** The columns the matcher reads; an admin product row satisfies it unchanged. */
export interface ProductNameSearchSource {
  id: string;
  product_translations: { name: string }[];
}

/** The comparable form of what the admin typed. Empty string = no search. */
export function normalizeProductSearch(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Whether one product answers to `needle` — which must already have been
 * through `normalizeProductSearch`. An empty needle matches everything, so a
 * caller can apply this unconditionally.
 */
export function matchesProductSearch(
  product: ProductNameSearchSource,
  needle: string,
): boolean {
  if (needle === "") return true;
  const id = productIdFromSearch(needle);
  if (id !== null) return product.id === id;
  return product.product_translations.some((tr) =>
    tr.name.toLowerCase().includes(needle),
  );
}

/** The rows a raw query string leaves standing, in their original order. */
export function filterProductsBySearch<T extends ProductNameSearchSource>(
  products: readonly T[],
  query: string,
): T[] {
  const needle = normalizeProductSearch(query);
  if (needle === "") return [...products];
  return products.filter((product) => matchesProductSearch(product, needle));
}
