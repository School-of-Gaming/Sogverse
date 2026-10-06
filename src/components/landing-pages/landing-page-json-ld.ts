import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import { organizationId } from "@/lib/seo/organization";
import type { LocalizedLandingPage } from "@/services/landing-pages/landing-pages.contracts";
import { landingLeadPicture, landingStructuredParts } from "./landing-section-seo";

export interface LandingPageJsonLdInput {
  /** The canonical site origin — `NEXT_PUBLIC_SITE_URL`. */
  siteUrl: string;
  /** The page's canonical path (`landingPageCanonicalPath`). */
  canonicalPath: string;
  page: LocalizedLandingPage;
}

/**
 * **A live landing page as one schema.org node** — rendered through `JsonLd`
 * on the page, and built only from the published copy the page itself shows,
 * so it can never assert anything the page does not.
 *
 * - **A `WebPage`, or a `FAQPage` when a section asks questions.** `FAQPage` is
 *   a kind of `WebPage`, so the questions make the one node more specific
 *   rather than adding a second page for the same address; every question of
 *   every questions section is its `mainEntity`, answered in plain text.
 * - **Each section type says what it contributes** (`LANDING_SECTION_SEO`):
 *   the hero its picture, as `primaryImageOfPage`; the questions sections
 *   their questions; the rest nothing.
 * - The `name` and `description` are the version's title and summary, the
 *   same words as `<title>` and the meta description. `datePublished` is the
 *   day the page first went live, `dateModified` the day its live versions
 *   were published.
 * - The `publisher` is School of Gaming, by the `@id` of the `Organization`
 *   node the `[locale]` layout emits on every page, so a consumer joins the
 *   two instead of meeting a second, thinner company.
 * - The `url` is the page's canonical, which follows the version shown, and
 *   `inLanguage` is that version's own language.
 *
 * Pure, so the whole shape is assertable without rendering a page.
 */
export function landingPageJsonLd({
  siteUrl,
  canonicalPath,
  page,
}: LandingPageJsonLdInput) {
  const url = `${siteUrl}${canonicalPath}`;
  const parts = landingStructuredParts(page.sections, page.sectionTexts);

  const picture = landingLeadPicture(page);
  const image = picture === null ? null : catalogueImageSrc("landing_image", picture.path);
  const questions = parts.flatMap((part) =>
    part.kind === "question"
      ? [
          {
            "@type": "Question",
            name: part.question,
            acceptedAnswer: { "@type": "Answer", text: part.answer },
          },
        ]
      : [],
  );

  return {
    "@context": "https://schema.org",
    "@type": questions.length > 0 ? "FAQPage" : "WebPage",
    url,
    name: page.title,
    description: page.summary,
    inLanguage: page.locale,
    datePublished: page.firstPublishedAt,
    dateModified: page.publishedAt,
    ...(image !== null && {
      primaryImageOfPage: { "@type": "ImageObject", url: image },
    }),
    ...(questions.length > 0 && { mainEntity: questions }),
    publisher: {
      "@type": "Organization",
      "@id": organizationId(siteUrl),
      name: "School of Gaming",
    },
  };
}
