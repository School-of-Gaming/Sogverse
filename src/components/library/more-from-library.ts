import { ROUTES } from "@/lib/constants";
import type { SupportedLocale } from "@/lib/constants/locales";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import {
  localizeArticleSummary,
  type PublishedLibraryArticleSummary,
} from "@/services/library/library.contracts";
import { libraryArticleCanonicalLocation } from "./article/article-metadata";
import type { LibraryCategory } from "./categories";
import type { LibraryArticleCardProps } from "./index-page/library-article-card";

/** What the selection reads off an article — and all it reads. */
export interface MoreFromLibraryCandidate {
  id: string;
  category: LibraryCategory;
  /** An ISO instant; later is newer. */
  publishedAt: string;
}

/**
 * **The articles an article page offers next**: up to `count` of them, the
 * current article's own category first, newest first, topped up from the
 * other categories, newest first, when its own runs short. The current article
 * is never among them. A current article with no category — a draft being
 * previewed — has no own category to put first, so it is offered the newest.
 *
 * Articles published at the same instant keep the order they were handed in,
 * so a caller handing them over newest first gets a stable answer.
 */
export function selectMoreFromLibrary<T extends MoreFromLibraryCandidate>(
  articles: readonly T[],
  current: { id: string; category: LibraryCategory | null },
  count = 3,
): T[] {
  const others = articles.filter((article) => article.id !== current.id);
  const newestFirst = (list: T[]) =>
    list.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const sameCategory = newestFirst(
    others.filter((article) => article.category === current.category),
  );
  const topUp = newestFirst(
    others.filter((article) => article.category !== current.category),
  );
  return [...sameCategory, ...topUp].slice(0, Math.max(0, count));
}

/**
 * **A published article as the card that opens it** — on the index and under
 * an article alike, in the version a reader of `locale` is shown. The date is
 * the one it first went live on. The card opens the article where its page at
 * `locale` canonicalises: its slug address in `locale`, or in the language of
 * the fallback the card shows. `published` is the live list the address is
 * judged against.
 */
export function publishedArticleCard(
  article: PublishedLibraryArticleSummary,
  published: readonly PublishedLibraryArticleSummary[],
  locale: SupportedLocale,
): LibraryArticleCardProps | null {
  const shown = localizeArticleSummary(article, locale);
  if (shown === null) return null;
  const location = libraryArticleCanonicalLocation(published, article, locale);
  return {
    id: article.id,
    href: ROUTES.libraryArticle(location.address),
    hrefLocale: location.locale,
    textLocale: shown.locale,
    coverSrc: catalogueImageSrc("library_cover", article.coverPath),
    title: shown.title,
    summary: shown.summary,
    category: article.category,
    publishedAt: article.firstPublishedAt,
  };
}

/** Every published article as its card for a reader of `locale`, in the list's order. */
export function publishedArticleCards(
  published: readonly PublishedLibraryArticleSummary[],
  locale: SupportedLocale,
): LibraryArticleCardProps[] {
  return published.flatMap((article) => {
    const card = publishedArticleCard(article, published, locale);
    return card === null ? [] : [card];
  });
}

/**
 * **"More from the Library" over what is live now**: the published articles
 * as the cards the section draws for a reader of `locale`, chosen for the
 * article being read.
 */
export function moreFromLibraryCards(
  published: readonly PublishedLibraryArticleSummary[],
  current: { id: string; category: LibraryCategory | null },
  locale: SupportedLocale,
): LibraryArticleCardProps[] {
  return selectMoreFromLibrary(publishedArticleCards(published, locale), current);
}
