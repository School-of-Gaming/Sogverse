/**
 * **The Library's categories.**
 *
 * The vocabulary is the `library_article_category` Postgres enum, reaching
 * TypeScript through `Constants`, so nothing here is hand-maintained. The
 * value is spelled the same everywhere: in the database, in the app and in the
 * index's `?category=`, so a shared filtered link carries the enum value as is.
 * Its words come from `library.categories` in the message files, through the
 * key map below, which is keyed by the enum and will not compile without an
 * entry for a value added by migration.
 *
 * A working copy may be saved without a category; publishing requires one, so
 * every published article is in exactly one.
 *
 * There is no news category on purpose: the Library holds what a parent can
 * still use next year, and a dated announcement is not that.
 */

import { Constants, type LibraryCategory } from "@/types";

export type { LibraryCategory };

/**
 * Every category, in the order the enum declares them — the order the index's
 * filter and the admin editor's select both list them in, so no call site
 * sorts.
 */
export const LIBRARY_CATEGORIES: readonly LibraryCategory[] =
  Constants.public.Enums.library_article_category;

/**
 * Whether an arbitrary string is a category — the guard a `?category=` term or
 * a select's value is narrowed through. Compared value-by-value, so a plain
 * `string` needs no cast to be checked against the generated literal union.
 */
export function isLibraryCategory(value: string): value is LibraryCategory {
  return LIBRARY_CATEGORIES.some((category) => category === value);
}

/** Each category's key under `library.categories`. */
export const LIBRARY_CATEGORY_MESSAGE_KEY = {
  online_safety: "onlineSafety",
  screen_time: "screenTime",
  learning: "learning",
  games_explained: "gamesExplained",
  for_schools: "forSchools",
} as const satisfies Record<LibraryCategory, string>;
