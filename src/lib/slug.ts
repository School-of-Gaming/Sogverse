import { z } from "zod";

/**
 * Slugs derived from a thing's own words, and the two-address pattern built
 * on them.
 *
 * **A public page with a slug has two addresses, and neither redirects.** One
 * is the thing's id, stable for as long as the thing exists, for developers
 * and anything that must not break; the other is a slug derived from what the
 * thing is called (a person's first name and nickname, an article's title),
 * the one people share and the canonical. The slug is stored nowhere: a page
 * derives the slugs of the public list and matches, so renaming the thing
 * changes its shared address and old shared links stop resolving, while the id
 * address always works. One dynamic segment takes either, told apart by
 * whether it parses as a UUID.
 *
 * **Two things deriving one slug: the first in the list's own order wins** —
 * the caller passes the list in the order it wants ties settled — and the
 * other stays reachable by its id alone. That is why "where does this thing
 * live" is answered against the list (`slugAddressOf`), never by deriving its
 * slug in isolation.
 */

/**
 * Letters that NFD does not decompose into a base letter plus a combining mark,
 * so the accent strip below would drop them outright. Each is written as the
 * ASCII its own language spells it with when it has to.
 */
const UNDECOMPOSED_LETTERS: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  ø: "o",
  œ: "oe",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
};

/**
 * A deterministic, URL-safe slug: lowercase ASCII kebab with diacritics
 * folded — `Ähtäri` → `ahtari`, `Eetu CreeperHug` → `eetu-creeperhug`,
 * `Søren Æbelø` → `soren-aebelo`, `What's on` → `whats-on`.
 *
 * The transform: Unicode NFD-decompose and drop the combining marks it leaves
 * (ä → a, é → e, å → a), lowercase, spell out the few letters NFD cannot split,
 * drop apostrophes, collapse every run of anything outside `[a-z0-9]` to one
 * hyphen, and trim hyphens from both ends.
 *
 * Apostrophes (straight, typographic and modifier) are dropped rather than
 * hyphenated, in every locale, so a word keeps its one piece — the WordPress
 * and Ghost convention: `parent's` → `parents`, `l'école` → `lecole`.
 *
 * Text with no Latin letter or digit in it slugs to the empty string, which is
 * no address at all: `findBySlug` never matches it, so the thing is reachable
 * by its id alone.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[ßæøœłđðþ]/g, (letter) => UNDECOMPOSED_LETTERS[letter])
    .replace(/['\u2018\u2019\u02bc]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const uuid = z.string().uuid();

/** What one id-or-slug path segment names. */
export type IdOrSlug = { id: string } | { slug: string };

/**
 * Read a path segment that takes either address: a UUID is an id, and
 * anything else is a slug. Only a name or a title that is itself a UUID could
 * derive a slug shaped like one, and that thing would be reachable by its id.
 */
export function parseIdOrSlug(segment: string): IdOrSlug {
  return uuid.safeParse(segment).success ? { id: segment } : { slug: segment };
}

/**
 * The thing a slug addresses: the first in `items`' order that derives it, or
 * `null` when none does. The empty slug addresses nothing.
 */
export function findBySlug<T>(
  items: readonly T[],
  slug: string,
  slugOf: (item: T) => string,
): T | null {
  if (slug === "") return null;
  return items.find((item) => slugOf(item) === slug) ?? null;
}

/**
 * The slug that addresses the thing with this id, or `null` when it has none:
 * it derives the empty slug, an item earlier in `items` claims the same slug
 * first, or it is not in `items` at all. A `null` means the id is the thing's
 * only address, and so its canonical one.
 */
export function slugAddressOf<T extends { id: string }>(
  items: readonly T[],
  id: string,
  slugOf: (item: T) => string,
): string | null {
  const item = items.find((candidate) => candidate.id === id);
  if (item === undefined) return null;
  const slug = slugOf(item);
  return findBySlug(items, slug, slugOf)?.id === id ? slug : null;
}

/**
 * Resolve one id-or-slug segment to its thing: a UUID by its id, anything else
 * by matching the slugs the public list derives. Each lookup answers `null`
 * for nothing there, which the page turns into a 404.
 */
export async function resolveIdOrSlug<T>(
  segment: string,
  lookups: {
    byId: (id: string) => Promise<T | null>;
    bySlug: (slug: string) => Promise<T | null>;
  },
): Promise<T | null> {
  const address = parseIdOrSlug(segment);
  return "id" in address ? lookups.byId(address.id) : lookups.bySlug(address.slug);
}
