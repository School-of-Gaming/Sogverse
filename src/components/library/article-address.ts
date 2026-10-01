import type { SupportedLocale } from "@/lib/constants/locales";
import { findBySlug, oldestFirst, slugAddressOf, slugify } from "@/lib/slug";

/*
 * Where an article lives. Two addresses, neither redirecting
 * (`src/lib/slug.ts`): `<library>/<id>`, which resolves in every locale, and
 * `<library>/<slug>`, the one people share and the canonical. **A slug is
 * per language**: it is derived from the title of the article's version in
 * that locale, on every read and stored nowhere, and it resolves in that
 * locale only — a Finnish title's slug under `/fi/kirjasto`, never under
 * `/en/library`. A locale the article was not written in has no slug for it,
 * and is reached by the id.
 *
 * **Two titles deriving one slug in a locale: the older article owns it** —
 * the one that went live first — and the newer is reachable by its id alone.
 */

/** What an address is judged on: the article's id, its live titles and when it first went live. */
export interface AddressableArticle {
  id: string;
  firstPublishedAt: string;
  versions: readonly { locale: SupportedLocale; title: string }[];
}

/** The slug the article's version in `locale` derives, or null when it has no version there. */
export function articleSlug(
  article: Pick<AddressableArticle, "versions">,
  locale: SupportedLocale,
): string | null {
  const version = article.versions.find((row) => row.locale === locale);
  return version === undefined ? null : slugify(version.title);
}

/** The articles with a version in `locale`, oldest first (`oldestFirst`). */
function writtenIn<T extends AddressableArticle>(
  articles: readonly T[],
  locale: SupportedLocale,
): T[] {
  return oldestFirst(
    articles.filter((article) => articleSlug(article, locale) !== null),
    (article) => article.firstPublishedAt,
  );
}

/** The published article a slug addresses in `locale`: the oldest whose title there derives it. */
export function findArticleBySlug<T extends AddressableArticle>(
  articles: readonly T[],
  locale: SupportedLocale,
  slug: string,
): T | null {
  return findBySlug(
    writtenIn(articles, locale),
    slug,
    (article) => articleSlug(article, locale) ?? "",
  );
}

/**
 * The path segment of the article's address in `locale`, judged against the
 * published list: the slug of its title there, or its id when it has no
 * version in `locale`, its title derives no slug, an older article's title
 * derives the same one, or it is not in the list at all.
 */
export function articleAddress(
  articles: readonly AddressableArticle[],
  article: Pick<AddressableArticle, "id">,
  locale: SupportedLocale,
): string {
  return (
    slugAddressOf(
      writtenIn(articles, locale),
      article.id,
      (candidate) => articleSlug(candidate, locale) ?? "",
    ) ?? article.id
  );
}
