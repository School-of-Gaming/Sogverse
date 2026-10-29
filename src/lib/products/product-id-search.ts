/**
 * Whether what an admin typed into a product search is a product ID, and which.
 *
 * Both product searches — the switch picker matching in the browser and the
 * admin product list asking the database — ask this one function, so a search
 * finds a product by its ID in one place exactly when it does in the other.
 *
 * **Only a whole, bare ID counts.** The text, trimmed, must *be* a UUID; an ID
 * inside a longer string is an ordinary name search. There is no partial-ID
 * match either: an ID is random hex, so a fragment like "3" would match most of
 * the catalogue. Case is ignored, and the ID comes back lowercased, the form
 * the database stores and prints.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The product ID the search text is, lowercased, or null when it is not one. */
export function productIdFromSearch(query: string): string | null {
  const trimmed = query.trim();
  return UUID.test(trimmed) ? trimmed.toLowerCase() : null;
}
