import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import {
  translatedCanonicalPath,
  translatedPageAlternates,
  translatedPageLocales,
  translatedPageMetadataAlternates,
  type TranslatedPagePath,
} from "@/lib/metadata/translated-page";
import { ogCardImage } from "@/lib/og/card-metadata";
import {
  localizeArticle,
  type PublishedLibraryArticle,
} from "@/services/library/library.contracts";
import { articleAddress, type AddressableArticle } from "../article-address";

/*
 * An article as crawlers and link previews meet it. The Library is promoted
 * (`docs/architecture/discoverability.md`), so an article carries a
 * canonical, its language versions and an `Article`.
 *
 * Its canonical and language versions follow the rule every page written per
 * locale follows (`src/lib/metadata/translated-page.ts`): the locales it was
 * written in are its language versions, and a locale it was not written in
 * canonicalises to the slug address of the locale whose text it shows.
 */

/** One place an article can be read: a locale, and the path segment there. */
export interface LibraryArticleLocation {
  locale: SupportedLocale;
  /** An id or a slug (`articleAddress`). */
  address: string;
}

/** A location's path, from the pathnames map — `/fi/kirjasto/<slug>`. */
export function libraryArticlePath({
  locale,
  address,
}: LibraryArticleLocation): string {
  return getPathname({ href: ROUTES.libraryArticle(address), locale });
}

/** The article's path at each locale: its address there, judged against `published`. */
function pathsOf(
  published: readonly AddressableArticle[],
  article: AddressableArticle,
): TranslatedPagePath {
  return (locale) =>
    libraryArticlePath({
      locale,
      address: articleAddress(published, article, locale),
    });
}

/** The canonical path of the article read at `locale`. */
export function libraryArticleCanonicalPath(
  published: readonly AddressableArticle[],
  article: AddressableArticle,
  locale: SupportedLocale,
): string {
  return translatedCanonicalPath(
    article.versions,
    locale,
    pathsOf(published, article),
  );
}

/**
 * The language versions an article has: one per indexed locale it was
 * written in, in the site's locale order. The sitemap lists exactly these.
 */
export function libraryArticleLocales(
  article: Pick<AddressableArticle, "versions">,
): SupportedLocale[] {
  return translatedPageLocales(article.versions);
}

/** The article's `hreflang` set; empty when it was written in no indexed locale. */
export function libraryArticleAlternates(
  published: readonly AddressableArticle[],
  article: AddressableArticle,
): Record<string, string> {
  return translatedPageAlternates(article.versions, pathsOf(published, article));
}

/**
 * A published article's metadata, read at `requestLocale`: the shown
 * version's title, its summary as the description, and the card a shared link
 * unfurls into.
 *
 * - **The canonical moves with the text shown**, and `og:url` is the same
 *   address.
 * - **The card's image is the cover, falling back to the site-wide card** at
 *   the request's locale — the card the `[locale]` layout would have emitted.
 *   It cannot be left to inheritance: Next assigns a child's `openGraph` and
 *   `twitter` over the parent's rather than merging them, so declaring either
 *   block drops the layout's image. `siteName` is restated for the same reason.
 * - **`og:type` is `article`**, with the day it first went live and the day
 *   the live versions were published. `og:locale` is the language of the
 *   version whose title and summary the card shows.
 */
export async function libraryArticleMetadata(
  article: PublishedLibraryArticle,
  published: readonly AddressableArticle[],
  requestLocale: string,
): Promise<Metadata> {
  const locale = resolveLocale(requestLocale);
  const shown = localizeArticle(article, locale);
  if (shown === null) return {};
  const cover = catalogueImageSrc("library_cover", article.coverPath);
  const images = cover
    ? [{ url: cover, alt: shown.title }]
    : [await ogCardImage("site", locale)];
  const { title, summary: description } = shown;
  const alternates = translatedPageMetadataAlternates(
    article.versions,
    locale,
    pathsOf(published, article),
  );
  const { canonical } = alternates;

  return {
    title,
    description,
    alternates,
    openGraph: {
      type: "article",
      siteName: "School of Gaming",
      locale: shown.locale,
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
