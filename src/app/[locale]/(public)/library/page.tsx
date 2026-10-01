import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { LibraryIndexBody } from "@/components/library/index-page/library-index-body";
import {
  libraryIndexBodyProps,
  parseLibraryCategory,
} from "@/components/library/index-page/library-index-props";
import { resolveLocale } from "@/lib/constants/locales";
import { localizedPageMetadata } from "@/lib/metadata/localized-page";
import { createClient } from "@/lib/supabase/server";
import { LibraryService } from "@/services/library/library.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  // A filtered view canonicalises to the unfiltered index.
  return {
    ...(await localizedPageMetadata("/library", await getLocale())),
    title: t("pages.library"),
    description: t("descriptions.library"),
  };
}

/**
 * **The Library index — every published article, newest first, filterable by
 * category.** Public and promoted.
 *
 * Rendered per request, like the shop, on the request's server client (the
 * publications table admits anon): what is live is what an admin last
 * published, with no revalidation to wait out. The list read carries no
 * bodies. Each card shows the version for the page's locale, falling back to
 * English and then to the first written, and opens the article where that
 * version's page canonicalises. A read that fails surfaces to the error
 * boundary rather than painting "nothing here yet" over a Library that has
 * articles.
 */
export default async function LibraryIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[] }>;
}) {
  const selectedCategory = parseLibraryCategory((await searchParams).category);
  const published = await new LibraryService(
    await createClient(),
  ).listPublishedArticles();

  return (
    <LibraryIndexBody
      {...libraryIndexBodyProps(
        published,
        selectedCategory,
        resolveLocale(await getLocale()),
      )}
    />
  );
}
