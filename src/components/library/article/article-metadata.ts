import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import { ogCardImage } from "@/lib/og/card-metadata";
import type { PublishedLibraryArticle } from "@/services/library";

/**
 * **The article's canonical path: its English address, whatever locale it is
 * read at.** Articles are written in English only, while the site has five
 * locales, so `/fi/kirjasto/<id>` and `/en/library/<id>` carry the same English
 * text under different chrome. One of them has to be the document, and the
 * English one is the language it is written in.
 */
export function libraryArticleCanonicalPath(id: string): string {
  return getPathname({ href: ROUTES.libraryArticle(id), locale: "en" });
}

/**
 * A published article's metadata: its title, its summary as the description,
 * and the card a shared link unfurls into.
 *
 * - **The canonical is the English address, and there are no `hreflang`
 *   alternates.** The articles are English at every locale's URL (see
 *   `libraryArticleCanonicalPath`), and a `languages` set would claim
 *   translations that do not exist. The Library index is different — its
 *   chrome really is localized — and takes the site's normal alternates once
 *   the Library launches.
 * - **The card's image is the cover, falling back to the site-wide card** at
 *   the request's locale — the card the `[locale]` layout would have emitted.
 *   It cannot be left to inheritance: Next assigns a child's `openGraph` and
 *   `twitter` over the parent's rather than merging them, so declaring either
 *   block drops the layout's image. `siteName` is restated for the same reason.
 * - **`og:type` is `article`**, with the day it first went live and the day
 *   the live version was published. `og:locale` is `en`, the language of the
 *   title and summary the card shows.
 *
 * **`noindex, nofollow`.** Owner decision (2026-09-29): the Library is not
 * promoted yet, so it is treated like the /schools tree until the owner's
 * visibility pass launches it (`docs/architecture/discoverability.md`). The
 * English canonical, the cover card and the page's JSON-LD are kept on
 * purpose: harmless on a noindex page, and it leaves the visibility pass only
 * the noindex to lift here.
 */
export async function libraryArticleMetadata(
  article: PublishedLibraryArticle,
  requestLocale: string,
): Promise<Metadata> {
  const cover = catalogueImageSrc("library_cover", article.coverPath);
  const images = cover
    ? [{ url: cover, alt: article.title }]
    : [await ogCardImage("site", resolveLocale(requestLocale))];
  const title = article.title;
  const description = article.summary;
  const canonical = libraryArticleCanonicalPath(article.id);

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: false, follow: false },
    openGraph: {
      type: "article",
      siteName: "School of Gaming",
      locale: "en",
      url: canonical,
      title,
      description,
      images,
      publishedTime: article.firstPublishedAt,
      modifiedTime: article.publishedAt,
    },
    twitter: { card: "summary_large_image", title, description, images },
  };
}
