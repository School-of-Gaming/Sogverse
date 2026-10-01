import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { findArticleBySlug } from "@/components/library/article-address";
import { ArticlePageBody } from "@/components/library/article/article-page-body";
import { articlePageBodyProps } from "@/components/library/article/article-page-props";
import { libraryArticleJsonLd } from "@/components/library/article/article-json-ld";
import {
  libraryArticleCanonicalPath,
  libraryArticleMetadata,
} from "@/components/library/article/article-metadata";
import { JsonLd } from "@/components/seo/json-ld";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveIdOrSlug } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";
import {
  localizeArticle,
  type PublishedLibraryArticle,
} from "@/services/library/library.contracts";
import { LibraryService } from "@/services/library/library.service";

interface PageProps {
  params: Promise<{ idOrSlug: string }>;
}

/**
 * Everything live, without bodies — what a slug is matched against, what
 * decides which article owns a slug two titles derive, and what "More from
 * the Library" is chosen from. `cache()` dedupes it, and the article read
 * below, across `generateMetadata` and the render within one request. The
 * client is the request's own server client; the publications table admits
 * anon, so a signed-out reader reads it too.
 */
const loadPublished = cache(async () =>
  new LibraryService(await createClient()).listPublishedArticles(),
);

/**
 * The published article a segment names, with every live version, or null:
 * an id in any locale, or a slug matched against the titles of the page's
 * own locale. Anything not live — an unknown id, an unpublished article, a
 * slug no live title in this locale derives — is null alike, and the page
 * answers it with a 404. **Only the published copy is ever read here**: the
 * working copy is the admin's, and its preview is a separate, admin-only page.
 */
const loadArticle = cache(async (segment: string) => {
  const locale = resolveLocale(await getLocale());
  const service = new LibraryService(await createClient());
  return resolveIdOrSlug<PublishedLibraryArticle>(segment, {
    byId: (id) => service.getPublishedArticle(id),
    bySlug: async (slug) => {
      const match = findArticleBySlug(await loadPublished(), locale, slug);
      return match === null ? null : service.getPublishedArticle(match.id);
    },
  });
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const article = await loadArticle((await params).idOrSlug);
  // The page answers not-found, and Next marks that response noindex itself.
  if (article === null) return {};
  return libraryArticleMetadata(article, await loadPublished(), await getLocale());
}

/**
 * **A Library article, as a parent meets it** — public and promoted, at either
 * of its two addresses, neither redirecting: `<library>/<id>` in every locale,
 * and `<library>/<slug>` in a locale it was written in. Both name the slug
 * address of the version the page shows as canonical.
 *
 * Rendered per request, like the shop: the reads run on the request's server
 * client, so an article goes live, changes or leaves the moment an admin
 * publishes or unpublishes it, with no revalidation to wait out. A read that
 * fails is not swallowed into a not-found — a transient database error is not
 * "this article does not exist" — and surfaces to the error boundary.
 */
export default async function LibraryArticlePage({ params }: PageProps) {
  const { idOrSlug } = await params;
  const locale = resolveLocale(await getLocale());
  const [article, published] = await Promise.all([
    loadArticle(idOrSlug),
    loadPublished(),
  ]);
  if (article === null) notFound();
  const shown = localizeArticle(article, locale);
  if (shown === null) notFound();
  const canonicalPath = libraryArticleCanonicalPath(published, article, locale);

  return (
    <>
      <JsonLd
        data={libraryArticleJsonLd({
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
          canonicalPath,
          article: shown,
        })}
      />
      <ArticlePageBody
        {...articlePageBodyProps(
          { ...shown, publishedAt: shown.firstPublishedAt, canonicalPath },
          published,
          locale,
        )}
      />
    </>
  );
}
