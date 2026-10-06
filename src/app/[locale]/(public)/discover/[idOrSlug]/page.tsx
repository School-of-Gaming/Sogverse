import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import {
  landingPageCanonicalPath,
  landingPageLocalePaths,
  resolveLandingPage,
} from "@/components/landing-pages/landing-page-address";
import { LandingPageBody } from "@/components/landing-pages/landing-page-body";
import { landingPageJsonLd } from "@/components/landing-pages/landing-page-json-ld";
import { landingPageMetadata } from "@/components/landing-pages/landing-page-metadata";
import { JsonLd } from "@/components/seo/json-ld";
import { LocaleSwitchPaths } from "@/i18n/locale-switch-paths";
import { resolveLocale } from "@/lib/constants/locales";
import { createClient } from "@/lib/supabase/server";
import { localizeLandingPage } from "@/services/landing-pages/landing-pages.contracts";
import { LandingPageService } from "@/services/landing-pages/landing-pages.service";

interface PageProps {
  params: Promise<{ idOrSlug: string }>;
}

/**
 * The live page a segment names, with every live version, or null: an id in
 * any locale, or a slug of the page locale's own version. Anything not live —
 * an unknown id, an unpublished page, a slug another locale holds — is null
 * alike, and the page answers it with a 404. **Only the published copy is ever
 * read here**: the working copy is the admin's, and its preview is a separate,
 * admin-only page. `cache()` dedupes the read across `generateMetadata` and
 * the render within one request; the client is the request's own server
 * client, and the published tables admit anon, so a signed-out reader reads
 * it too.
 */
const loadPage = cache(async (segment: string) => {
  const locale = resolveLocale(await getLocale());
  const service = new LandingPageService(await createClient());
  return resolveLandingPage(segment, locale, {
    byId: (id) => service.getPublishedPage(id),
    bySlug: (slugLocale, slug) => service.getPublishedPageBySlug(slugLocale, slug),
  });
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = await loadPage((await params).idOrSlug);
  // The page answers not-found, and Next marks that response noindex itself.
  if (page === null) return {};
  return landingPageMetadata(page, await getLocale());
}

/**
 * **A landing page, as a stranger arriving from a search meets it** — public
 * and promoted, at either of its two addresses, neither redirecting:
 * `<discover>/<id>` in every locale, and `<discover>/<slug>` in a locale it is
 * live in. Both name the slug address of the version shown as canonical.
 *
 * Rendered per request, like the Library: a page goes live, changes or leaves
 * the moment an admin publishes or unpublishes it, with no revalidation to wait
 * out. A read that fails is not swallowed into a not-found — a transient
 * database error is not "this page does not exist" — and surfaces to the error
 * boundary.
 */
export default async function LandingPage({ params }: PageProps) {
  const { idOrSlug } = await params;
  const locale = resolveLocale(await getLocale());
  const page = await loadPage(idOrSlug);
  if (page === null) notFound();
  const shown = localizeLandingPage(page, locale);
  if (shown === null) notFound();
  const canonicalPath = landingPageCanonicalPath(page, locale);

  return (
    <>
      {/* A slug resolves only in its own locale, so the picker is told this
          page's address in every locale. */}
      <LocaleSwitchPaths paths={landingPageLocalePaths(page)} />
      <JsonLd
        data={landingPageJsonLd({
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
          canonicalPath,
          page: shown,
        })}
      />
      <LandingPageBody
        sections={shown.sections}
        imagePaths={shown.imagePaths}
        sectionTexts={shown.sectionTexts}
        textLocale={shown.locale}
        locale={locale}
      />
    </>
  );
}
