import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { LibraryIndexBody } from "@/components/library/index-page/library-index-body";
import {
  libraryIndexBodyProps,
  parseLibraryCategory,
} from "@/components/library/index-page/library-index-props";
import { resolveLocale } from "@/lib/constants/locales";
import { createClient } from "@/lib/supabase/server";
import { localizeArticleSummaries } from "@/services/library/library.contracts";
import { LibraryService } from "@/services/library/library.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  // Owner decision (2026-09-29): the Library is not promoted yet, so it is
  // treated like the /schools tree — noindex, and absent from the sitemap and
  // `llms.txt` — until the owner's visibility pass launches it
  // (`docs/architecture/discoverability.md`). No `hreflang` alternates either:
  // a page telling crawlers to leave has no business annotating its language
  // versions. Launching restores them (`localizedPageMetadata("/library", …)`),
  // and every filtered view then canonicalizes to the unfiltered index.
  return {
    title: t("pages.library"),
    description: t("descriptions.library"),
    robots: { index: false, follow: false },
  };
}

/**
 * **The Library index — every published article, newest first, filterable by
 * category.** Public, and `noindex` until the Library launches.
 *
 * Rendered per request, like the shop, on the request's server client (the
 * publications table admits anon): what is live is what an admin last
 * published, with no revalidation to wait out. The list read carries no
 * bodies. Each card shows the version for the page's locale, falling back to
 * English and then to the first written. A read that fails surfaces to the error boundary rather than
 * painting "nothing here yet" over a Library that has articles.
 */
export default async function LibraryIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[] }>;
}) {
  const selectedCategory = parseLibraryCategory((await searchParams).category);
  const published = localizeArticleSummaries(
    await new LibraryService(await createClient()).listPublishedArticles(),
    resolveLocale(await getLocale()),
  );

  return (
    <LibraryIndexBody {...libraryIndexBodyProps(published, selectedCategory)} />
  );
}
