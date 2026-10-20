import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { DiscoverIndexBody } from "@/components/landing-pages/index-page/discover-index-body";
import { discoverIndexJsonLd } from "@/components/landing-pages/index-page/discover-index-json-ld";
import { discoverIndexEntries } from "@/components/landing-pages/index-page/discover-index-props";
import { JsonLd } from "@/components/seo/json-ld";
import { getPathname } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants/routes";
import { resolveLocale } from "@/lib/constants/locales";
import { localizedPageMetadata } from "@/lib/metadata/localized-page";
import { createClient } from "@/lib/supabase/server";
import { LandingPageService } from "@/services/landing-pages/landing-pages.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    ...(await localizedPageMetadata(ROUTES.discover, await getLocale())),
    title: t("pages.discover"),
    description: t("descriptions.discover"),
  };
}

/**
 * **The landing pages' index — every live landing page, newest first.**
 * Public and promoted, and it exists for crawlers first: it is the one page on
 * the site linking to every landing page, which is what keeps them from being
 * orphans a search engine finds only through the sitemap. The footer links
 * here from every page.
 *
 * Rendered per request, like the Library, on the request's server client (the
 * publications table admits anon): a page published or unpublished is in or
 * out at once. The list read carries no words. A read that fails surfaces to
 * the error boundary rather than painting "nothing here yet" over pages that
 * are live.
 */
export default async function DiscoverIndexPage() {
  const locale = resolveLocale(await getLocale());
  const t = await getTranslations("metadata");
  const live = await new LandingPageService(
    await createClient(),
  ).listPublishedPages();
  const entries = discoverIndexEntries(live, locale);

  return (
    <>
      <JsonLd
        data={discoverIndexJsonLd({
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
          path: getPathname({ href: ROUTES.discover, locale }),
          locale,
          name: t("pages.discover"),
          description: t("descriptions.discover"),
          entries,
        })}
      />
      <DiscoverIndexBody pages={entries.map((entry) => entry.card)} />
    </>
  );
}
