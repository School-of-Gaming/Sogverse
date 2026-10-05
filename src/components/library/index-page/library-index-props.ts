import { ROUTES } from "@/lib/constants";
import type { SupportedLocale } from "@/lib/constants/locales";
import type { AppHref } from "@/lib/constants/routes";
import type { PublishedLibraryArticleSummary } from "@/services/library";
import { isLibraryCategory, type LibraryCategory } from "../categories";
import { publishedArticleCards } from "../more-from-library";
import type { LibraryIndexBodyProps } from "./library-index-body";

/**
 * The index's `?category=` term as the category it filters to, or `null` for
 * all of them.
 *
 * **A term that is not a category reads as "all", never as a not-found.** The
 * term is a filter over a page that exists, and a stale or mistyped shared link
 * still reaches the Library. A repeated term (`?category=a&category=b`) names
 * no single category, so it reads as "all" too.
 */
export function parseLibraryCategory(
  term: string | string[] | undefined,
): LibraryCategory | null {
  return typeof term === "string" && isLibraryCategory(term) ? term : null;
}

/**
 * Where each filter chip goes: the unfiltered index for "All", and the index
 * filtered to each category. Spelled out per category rather than mapped, so a
 * category added to the enum is a compile error here until it has a chip.
 */
export const LIBRARY_FILTER_HREFS: Record<LibraryCategory | "all", AppHref> = {
  all: ROUTES.library,
  online_safety: ROUTES.libraryCategory("online_safety"),
  screen_time: ROUTES.libraryCategory("screen_time"),
  learning: ROUTES.libraryCategory("learning"),
  games_explained: ROUTES.libraryCategory("games_explained"),
  for_schools: ROUTES.libraryCategory("for_schools"),
};

/**
 * **Everything `LibraryIndexBody` draws, from what is live now and the
 * selected category, for a reader of `locale`.** The published articles
 * arrive newest first by the day they first went live, and keep that order.
 */
export function libraryIndexBodyProps(
  published: readonly PublishedLibraryArticleSummary[],
  selectedCategory: LibraryCategory | null,
  locale: SupportedLocale,
): LibraryIndexBodyProps {
  return {
    articles: publishedArticleCards(published, locale).filter(
      (card) => selectedCategory === null || card.category === selectedCategory,
    ),
    selectedCategory,
    filterHrefs: LIBRARY_FILTER_HREFS,
  };
}
