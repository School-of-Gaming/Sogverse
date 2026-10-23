import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import {
  landingPageCanonicalPath,
  landingPageLocalePaths,
  resolveLandingPage,
} from "@/components/landing-pages/landing-page-address";
import { LandingPageBody } from "@/components/landing-pages/landing-page-body";
import {
  LandingPageBreadcrumb,
  landingBreadcrumbJsonLd,
  type LandingBreadcrumb,
} from "@/components/landing-pages/landing-page-breadcrumb";
import {
  landingPageJsonLd,
  landingProductListsJsonLd,
} from "@/components/landing-pages/landing-page-json-ld";
import { landingPageMetadata } from "@/components/landing-pages/landing-page-metadata";
import { prefetchLandingProducts } from "@/components/landing-pages/landing-page-products";
import { JsonLd } from "@/components/seo/json-ld";
import { LocaleSwitchPaths } from "@/i18n/locale-switch-paths";
import { resolveLocale } from "@/lib/constants/locales";
import {
  landingPlacedGuideIds,
  landingPlacedTestimonialIds,
} from "@/lib/landing-pages/sections";
import { createClient } from "@/lib/supabase/server";
import { GuidesService } from "@/services/guides/guides.service";
import { localizeLandingPage } from "@/services/landing-pages/landing-pages.contracts";
import { LandingPageService } from "@/services/landing-pages/landing-pages.service";
import { testimonialsById } from "@/services/landing-pages/landing-pages.testimonials";
import { TestimonialsService } from "@/services/testimonials/testimonials.service";

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
 * A quiet breadcrumb trail leads it — the landing pages' index, then the
 * page — the trail its `BreadcrumbList` states, so every landing page links
 * up to the index that lists it.
 *
 * Rendered per request, like the Library: a page goes live, changes or leaves
 * the moment an admin publishes or unpublishes it, with no revalidation to wait
 * out. A read that fails is not swallowed into a not-found — a transient
 * database error is not "this page does not exist" — and surfaces to the error
 * boundary.
 *
 * The testimonials the page places are read from the store on every request,
 * through the public read that answers only what the live copy places, so an
 * admin's edit to one shows here at once, without a republish. A page placing
 * none reads nothing more. The guides it places are read the same way, beside
 * them: only which of them exist. Who may download one is the only thing on
 * the page that depends on the reader, and it is decided in the browser from
 * the session the app already holds, so the page is the same render for
 * everyone.
 *
 * **A page with products sections waits on one more read before its HTML**:
 * the listing of every product type and seat counts for every pick at once,
 * the read the shop and the Roblox page make over their own types, so the
 * cards — or a section's absence when none of its picks is listed — are in the
 * first byte and nothing below them moves.
 * It runs after the page read, since the picks are the page's, beside the
 * testimonials' and the guides' reads, and a failure of it costs the cards
 * their first frame and never the page.
 */
export default async function LandingPage({ params }: PageProps) {
  const { idOrSlug } = await params;
  const locale = resolveLocale(await getLocale());
  const page = await loadPage(idOrSlug);
  if (page === null) notFound();
  const shown = localizeLandingPage(page, locale);
  if (shown === null) notFound();
  const canonicalPath = landingPageCanonicalPath(page, locale);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const tDiscover = await getTranslations("discover");
  const trail: LandingBreadcrumb = {
    indexName: tDiscover("name"),
    title: shown.title,
  };
  const supabase = await createClient();
  const [products, testimonials, guideIds] = await Promise.all([
    prefetchLandingProducts(shown.sections),
    landingPlacedTestimonialIds(page.sections).length === 0
      ? {}
      : new TestimonialsService(supabase)
          .listLandingPageTestimonials(page.id)
          .then(testimonialsById),
    landingPlacedGuideIds(page.sections).length === 0
      ? []
      : new GuidesService(supabase).listLandingPageGuides(page.id),
  ]);

  return (
    <>
      {/* A slug resolves only in its own locale, so the picker is told this
          page's address in every locale. */}
      <LocaleSwitchPaths paths={landingPageLocalePaths(page)} />
      <JsonLd data={landingPageJsonLd({ siteUrl, canonicalPath, page: shown })} />
      {landingProductListsJsonLd({
        siteUrl,
        locale,
        page: shown,
        listing: products?.listing ?? null,
      }).map(({ sectionId, list }) => (
        <JsonLd key={sectionId} data={list} />
      ))}
      <JsonLd
        data={landingBreadcrumbJsonLd({ siteUrl, locale, canonicalPath, trail })}
      />
      <LandingPageBody
        breadcrumb={
          <LandingPageBreadcrumb
            trail={trail}
            label={tDiscover("breadcrumbLabel")}
            textLocale={shown.locale}
            locale={locale}
          />
        }
        sections={shown.sections}
        pictures={shown.pictures}
        testimonials={testimonials}
        guideIds={guideIds}
        sectionTexts={shown.sectionTexts}
        textLocale={shown.locale}
        locale={locale}
        products={products}
        pageId={page.id}
        preview={false}
      />
    </>
  );
}
