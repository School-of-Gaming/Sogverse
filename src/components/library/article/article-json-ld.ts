import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import type { LocalizedLibraryArticle } from "@/services/library";

export interface LibraryArticleJsonLdInput {
  /** The canonical site origin — `NEXT_PUBLIC_SITE_URL`. */
  siteUrl: string;
  /** The page's canonical path (`libraryArticleCanonicalPath`). */
  canonicalPath: string;
  article: LocalizedLibraryArticle;
}

/**
 * **A published article as a schema.org `Article`** — rendered through
 * `JsonLd` on the article page, and built only from the published copy the
 * page itself shows, so it can never assert anything the page does not.
 *
 * - `datePublished` is the day the article first went live, which is the date
 *   the page shows; `dateModified` is when the live version was published.
 * - The `image` is the cover, and is omitted for an article without one: the
 *   site-wide card is a picture of the brand, not of this article.
 * - There is no `author`: the page names none, and structured data does not
 *   state what the page does not.
 * - The `publisher` is School of Gaming, by the `@id` of the `Organization`
 *   node the `[locale]` layout emits on every page, so a consumer joins the
 *   two instead of meeting a second, thinner company.
 * - The `url` is the page's canonical, which follows the version shown, and
 *   `inLanguage` is that version's own language.
 *
 * Pure, so the whole shape is assertable without rendering a page.
 */
export function libraryArticleJsonLd({
  siteUrl,
  canonicalPath,
  article,
}: LibraryArticleJsonLdInput) {
  const url = `${siteUrl}${canonicalPath}`;
  const image = catalogueImageSrc("library_cover", article.coverPath);

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.summary,
    ...(image !== null && { image }),
    datePublished: article.firstPublishedAt,
    dateModified: article.publishedAt,
    inLanguage: article.locale,
    url,
    mainEntityOfPage: url,
    publisher: {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "School of Gaming",
    },
  };
}
