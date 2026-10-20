import "server-only";
import {
  articleAddress,
  type AddressableArticle,
} from "@/components/library/article-address";
import { libraryArticleLocales } from "@/components/library/article/article-metadata";
import { getPathname } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { INDEXED_LOCALES } from "@/lib/metadata/localized-page";
import type { LibraryService } from "@/services/library/library.service";
import { changeAndSubmit, changedUrls, type LiveAddress } from "./indexnow";

/**
 * One live article's addresses as a crawler should know them: its slug
 * address in each indexed language it was written in, judged against every
 * live article — exactly the URLs the sitemap lists for it.
 */
export function libraryArticleUrls(
  published: readonly AddressableArticle[],
  article: AddressableArticle,
  siteUrl: string,
): string[] {
  return libraryArticleLocales(article).map(
    (locale) =>
      `${siteUrl}${getPathname({
        href: ROUTES.libraryArticle(articleAddress(published, article, locale)),
        locale,
      })}`,
  );
}

/** Every live article's addresses, each with the article it shows. */
function allArticleUrls(
  published: readonly AddressableArticle[],
  siteUrl: string,
): LiveAddress[] {
  return published.flatMap((article) =>
    libraryArticleUrls(published, article, siteUrl).map(
      (url): LiveAddress => [url, article.id],
    ),
  );
}

/** The Library index in every indexed locale. */
export function libraryIndexUrls(siteUrl: string): string[] {
  return INDEXED_LOCALES.map(
    (locale) => `${siteUrl}${getPathname({ href: ROUTES.library, locale })}`,
  );
}

/**
 * What a change to one article's live copy tells IndexNow: the article's
 * addresses as they now stand, every address across the whole live Library
 * that went away, appeared or now shows another article, and the Library
 * index.
 *
 * The whole Library is compared, not the one article, because an article's
 * slug is derived from its title and contested: two titles deriving one slug
 * in a locale leave it to the article that went live first, so unpublishing or
 * retitling one article can hand its slug address to another.
 */
export function libraryChangeUrls(
  id: string,
  before: readonly AddressableArticle[] | null,
  after: readonly AddressableArticle[],
  siteUrl: string,
): string[] {
  const article = after.find((candidate) => candidate.id === id);
  return changedUrls({
    beforeAll: allArticleUrls(before ?? [], siteUrl),
    afterAll: allArticleUrls(after, siteUrl),
    item: article === undefined ? [] : libraryArticleUrls(after, article, siteUrl),
    indexes: libraryIndexUrls(siteUrl),
  });
}

/**
 * **Publish a Library article, and tell search engines.** The one way an
 * article goes live, for the admin's route and the MCP tool alike: the
 * service's publish on the caller's own client, then the IndexNow
 * submission, which never fails the publish (`changeAndSubmit`).
 */
export function publishLibraryArticle(service: LibraryService, id: string): Promise<void> {
  return changeArticle(service, id, "publish", () => service.publishArticle(id));
}

/** **Unpublish a Library article, and tell search engines** — its addresses went away. */
export function unpublishLibraryArticle(
  service: LibraryService,
  id: string,
): Promise<void> {
  return changeArticle(service, id, "unpublish", () => service.unpublishArticle(id));
}

function changeArticle(
  service: LibraryService,
  id: string,
  action: string,
  change: () => Promise<void>,
): Promise<void> {
  return changeAndSubmit({
    label: `Library article ${id} ${action}`,
    change,
    snapshot: () => service.listPublishedArticles(),
    urls: (before, after, siteUrl) => libraryChangeUrls(id, before, after, siteUrl),
  });
}
