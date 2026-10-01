import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ArticlePageBody } from "@/components/library/article/article-page-body";
import { articlePageBodyProps } from "@/components/library/article/article-page-props";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { resolveLocale } from "@/lib/constants/locales";
import { createClient, getUserWithProfile } from "@/lib/supabase/server";
import { localizeArticleSummaries } from "@/services/library/library.contracts";
import { LibraryService } from "@/services/library/library.service";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * **An article's saved working copy, exactly as a parent would meet it if it
 * were published now** — what the editor's Preview opens, in a new tab, in
 * the public site's own chrome.
 *
 * Admin-only. The proxy gates the route on the admin role, and this page
 * answers not-found to anyone else as well, rather than rendering what an
 * admin-only read hands a non-admin: nothing. The read is the session's own —
 * the working copy's table admits admins alone — so there is no service role
 * here.
 *
 * What would be published is the saved copy, so that is what is shown; the
 * editor holds Preview back while its form has unsaved changes. The date is
 * the one the article first went live on, or today for one that never has —
 * the day it would go live if published now. "More from the Library" is chosen
 * from what is live now, as the article's own page chooses it. A draft saved
 * without a category is shown without the eyebrow, rather than not at all.
 *
 * The version shown is the page locale's, which the editor's Preview opens on
 * for the language tab in front of the admin; without one, the same fallback a
 * reader gets (English, then the first written). A version still being written
 * is shown as it stands, blanks included, since it is the one being worked on.
 */
export default async function LibraryArticlePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const viewer = await getUserWithProfile();
  if (viewer?.profile?.role !== "admin") notFound();

  const service = new LibraryService(await createClient());
  // An id that is not a UUID answers null without a query.
  const [article, published] = await Promise.all([
    service.getAdminArticle(id),
    service.listPublishedArticles(),
  ]);
  if (article === null) notFound();

  const locale = await getLocale();
  const { draft } = article;
  const version = resolveTranslation(draft.versions, resolveLocale(locale));
  if (version === null) notFound();

  return (
    <ArticlePageBody
      {...articlePageBodyProps(
        {
          id: draft.id,
          category: draft.category,
          coverPath: draft.coverPath,
          title: version.title,
          summary: version.summary,
          body: version.body,
          publishedAt:
            article.publication?.firstPublishedAt ?? new Date().toISOString(),
        },
        localizeArticleSummaries(published, resolveLocale(locale)),
        locale,
      )}
    />
  );
}
