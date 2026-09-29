import { ROUTES } from "@/lib/constants";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import type { PublishedLibraryArticleSummary } from "@/services/library";
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
 * an article alike. The date is the one it first went live on.
 */
export function publishedArticleCard(
  article: PublishedLibraryArticleSummary,
): LibraryArticleCardProps {
  return {
    id: article.id,
    href: ROUTES.libraryArticle(article.id),
    coverSrc: catalogueImageSrc("library_cover", article.coverPath),
    title: article.title,
    summary: article.summary,
    category: article.category,
    publishedAt: article.firstPublishedAt,
  };
}

/**
 * **"More from the Library" over what is live now**: the published articles
 * as the cards the section draws, chosen for the article being read.
 */
export function moreFromLibraryCards(
  published: readonly PublishedLibraryArticleSummary[],
  current: { id: string; category: LibraryCategory | null },
): LibraryArticleCardProps[] {
  return selectMoreFromLibrary(published.map(publishedArticleCard), current);
}
