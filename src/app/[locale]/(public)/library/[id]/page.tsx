import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ArticlePageBody } from "@/components/library/article/article-page-body";
import { articlePageBodyProps } from "@/components/library/article/article-page-props";
import { libraryArticleJsonLd } from "@/components/library/article/article-json-ld";
import {
  libraryArticleCanonicalPath,
  libraryArticleMetadata,
} from "@/components/library/article/article-metadata";
import { JsonLd } from "@/components/seo/json-ld";
import { resolveLocale } from "@/lib/constants/locales";
import { createClient } from "@/lib/supabase/server";
import {
  localizeArticle,
  localizeArticleSummaries,
} from "@/services/library/library.contracts";
import { LibraryService } from "@/services/library/library.service";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * The published copy in the version for the page's locale — the reader's own,
 * else English, else the first written — or null when the article is not live — an unknown id,
 * one that is not a UUID (answered without a query), or an article that was
 * never published or has been unpublished. **Only the published copy is ever
 * read here**: the working copy is the admin's, and its preview is a separate,
 * admin-only page.
 *
 * `cache()` dedupes the read across `generateMetadata` and the page render
 * within a single request. The client is the request's own server client, as
 * the shop's is; the publications table admits anon, so a signed-out reader
 * reads it too.
 */
const loadArticle = cache(async (id: string) => {
  const article = await new LibraryService(
    await createClient(),
  ).getPublishedArticle(id);
  return article === null
    ? null
    : localizeArticle(article, resolveLocale(await getLocale()));
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const article = await loadArticle((await params).id);
  // The page answers not-found, and Next marks that response noindex itself.
  if (article === null) return {};
  return libraryArticleMetadata(article, await getLocale());
}

/**
 * **A Library article, as a parent meets it** — public, and `noindex` until
 * the Library launches (its metadata says why).
 *
 * Rendered per request, like the shop: the reads run on the request's server
 * client, so an article goes live, changes or leaves the moment an admin
 * publishes or unpublishes it, with no revalidation to wait out. A read that
 * fails is not swallowed into a not-found — a transient database error is not
 * "this article does not exist" — and surfaces to the error boundary.
 */
export default async function LibraryArticlePage({ params }: PageProps) {
  const { id } = await params;
  const locale = await getLocale();
  const service = new LibraryService(await createClient());
  const [article, published] = await Promise.all([
    loadArticle(id),
    service.listPublishedArticles(),
  ]);
  if (article === null) notFound();

  return (
    <>
      <JsonLd
        data={libraryArticleJsonLd({
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
          canonicalPath: libraryArticleCanonicalPath(article.id),
          article,
        })}
      />
      <ArticlePageBody
        {...articlePageBodyProps(
          { ...article, publishedAt: article.firstPublishedAt },
          localizeArticleSummaries(published, resolveLocale(locale)),
          locale,
        )}
      />
    </>
  );
}
