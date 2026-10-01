import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import { INDEXED_LOCALES } from "@/lib/metadata/localized-page";
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
 * **An article's language versions are the locales it was written in.** A
 * locale it was not written in shows the fallback text — the reader's locale,
 * then English, then the first written — and canonicalises to the address of
 * the locale whose text it shows, its slug address there. So only the locales
 * written are language versions, and each of those is its own canonical.
 *
 * **Text in a locale that is not indexed is never canonicalised to.** That
 * locale's page is noindex (`INDEXED_LOCALES`: Klingon, a real locale but an
 * easter egg), so a page showing such text is its own canonical and names no
 * language versions.
 */

/** One place an article can be read: a locale, and the path segment there. */
export interface LibraryArticleLocation {
  locale: SupportedLocale;
  /** An id or a slug (`articleAddress`). */
  address: string;
}

/** The locale whose words the page shows at `locale`: its own when written, else the fallback's. */
export function libraryArticleTextLocale(
  article: Pick<AddressableArticle, "versions">,
  locale: SupportedLocale,
): SupportedLocale {
  return resolveTranslation(article.versions, locale)?.locale ?? locale;
}

function showsIndexedText(
  article: Pick<AddressableArticle, "versions">,
  locale: SupportedLocale,
): boolean {
  return INDEXED_LOCALES.includes(libraryArticleTextLocale(article, locale));
}

/**
 * Where the article read at `locale` is canonically read: its address in the
 * locale whose words the page shows, or in `locale` itself when those words
 * are in a locale that is not indexed. This is also where a card showing the
 * article at `locale` opens it, so a card showing the English fallback opens
 * the English page. `published` is the live list the address is judged
 * against.
 */
export function libraryArticleCanonicalLocation(
  published: readonly AddressableArticle[],
  article: AddressableArticle,
  locale: SupportedLocale,
): LibraryArticleLocation {
  const at = showsIndexedText(article, locale)
    ? libraryArticleTextLocale(article, locale)
    : locale;
  return { locale: at, address: articleAddress(published, article, at) };
}

/** A location's path, from the pathnames map — `/fi/kirjasto/<slug>`. */
export function libraryArticlePath({
  locale,
  address,
}: LibraryArticleLocation): string {
  return getPathname({ href: ROUTES.libraryArticle(address), locale });
}

/** The canonical path of the article read at `locale`. */
export function libraryArticleCanonicalPath(
  published: readonly AddressableArticle[],
  article: AddressableArticle,
  locale: SupportedLocale,
): string {
  return libraryArticlePath(
    libraryArticleCanonicalLocation(published, article, locale),
  );
}

/**
 * The language versions an article has: one per indexed locale it was
 * written in, in the site's locale order. The sitemap lists exactly these.
 */
export function libraryArticleLocales(
  article: Pick<AddressableArticle, "versions">,
): SupportedLocale[] {
  return INDEXED_LOCALES.filter((locale) =>
    article.versions.some((row) => row.locale === locale),
  );
}

/**
 * The `hreflang` set: each written, indexed locale at its own address, and
 * `x-default` at the page a reader in any other language is shown — the one
 * English resolves to, since an unmatched language lands on English. Empty
 * when the article was written in no indexed locale.
 */
export function libraryArticleAlternates(
  published: readonly AddressableArticle[],
  article: AddressableArticle,
): Record<string, string> {
  const locales = libraryArticleLocales(article);
  if (locales.length === 0) return {};
  return {
    ...Object.fromEntries(
      locales.map((locale) => [
        locale,
        libraryArticlePath({
          locale,
          address: articleAddress(published, article, locale),
        }),
      ]),
    ),
    "x-default": libraryArticleCanonicalPath(published, article, "en"),
  };
}

/**
 * A published article's metadata, read at `requestLocale`: the shown
 * version's title, its summary as the description, and the card a shared link
 * unfurls into.
 *
 * - **The canonical moves with the text shown**
 *   (`libraryArticleCanonicalLocation`), and `og:url` is the same address.
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
  const canonical = libraryArticleCanonicalPath(published, article, locale);
  // A page showing text that is not indexed is its own canonical, outside
  // the set of language versions, so it names none of them.
  const languages = showsIndexedText(article, locale)
    ? libraryArticleAlternates(published, article)
    : {};

  return {
    title,
    description,
    alternates: {
      canonical,
      ...(Object.keys(languages).length > 0 && { languages }),
    },
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
