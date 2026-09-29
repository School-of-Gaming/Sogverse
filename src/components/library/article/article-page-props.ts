import { getPathname } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import type { PublishedLibraryArticleSummary } from "@/services/library";
import type { LibraryCategory } from "../categories";
import { moreFromLibraryCards } from "../more-from-library";
import type { ArticlePageBodyProps } from "./article-page-body";

/**
 * One copy of an article, as both server shells hand it to the page: the
 * public article page its published copy, the admin preview its saved working
 * copy.
 */
export interface ArticlePageSource {
  id: string;
  title: string;
  summary: string;
  /** Null only for a working copy saved without one. */
  category: LibraryCategory | null;
  /** The date the page shows: when the article first went live. */
  publishedAt: string;
  /** The cover's path in the `library-covers` bucket, or null for none. */
  coverPath: string | null;
  /** Authored markdown. */
  body: string;
}

/**
 * The article's absolute address at a locale — the site origin joined to the
 * translated path, as the share links and the metadata state it.
 */
export function libraryArticleUrl(id: string, locale: string): string {
  const path = getPathname({ href: ROUTES.libraryArticle(id), locale });
  return `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}${path}`;
}

/**
 * **Everything `ArticlePageBody` draws, from one copy of an article and what is
 * live now.** The article page and the admin preview both build their props
 * here, so the preview is the page a parent would meet and cannot drift from
 * it: the cover resolved as a Library cover, the back link, the eyebrow's
 * filtered index, the share address at the reader's locale, and "More from the
 * Library" chosen from the published articles.
 */
export function articlePageBodyProps(
  article: ArticlePageSource,
  published: readonly PublishedLibraryArticleSummary[],
  locale: string,
): ArticlePageBodyProps {
  return {
    article: {
      title: article.title,
      summary: article.summary,
      category: article.category,
      publishedAt: article.publishedAt,
      coverSrc: catalogueImageSrc("library_cover", article.coverPath),
      bodyMarkdown: article.body,
    },
    libraryHref: ROUTES.library,
    categoryHref:
      article.category === null ? null : ROUTES.libraryCategory(article.category),
    shareUrl: libraryArticleUrl(article.id, locale),
    moreArticles: moreFromLibraryCards(published, article),
  };
}
