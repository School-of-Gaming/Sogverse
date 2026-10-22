import { productItemList } from "@/components/public/products/product-item-list";
import { selectRailProducts } from "@/components/public/products/product-rail-selection";
import { SHOP_PRODUCT_TYPES } from "@/components/public/products/shop-categories";
import type { SupportedLocale } from "@/lib/constants/locales";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import { organizationId } from "@/lib/seo/organization";
import type { ProductBrowseRow } from "@/types";
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
 *   their questions; the products sections a list of their own beside this
 *   node (`landingProductListsJsonLd`); the rest nothing.
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

export interface LandingProductListsInput {
  /** The canonical site origin — `NEXT_PUBLIC_SITE_URL`. */
  siteUrl: string;
  /** The page's locale — the URL's, which the cards' names are read in. */
  locale: SupportedLocale;
  page: Pick<LocalizedLandingPage, "sections" | "sectionTexts">;
  /**
   * The listing as the page read it (`prefetchLandingProducts`), every type,
   * or null when the read failed or the page has no products section.
   */
  listing: readonly ProductBrowseRow[] | null;
}

/** The types whose product pages are promoted: the shop's. */
const SHOP_TYPES: ReadonlySet<string> = new Set(SHOP_PRODUCT_TYPES);

/**
 * **The products a live landing page promotes, as one schema.org `ItemList`
 * per products section** — each the shop listing page's list
 * (`productItemList`): position, name and the product page's URL, and none of
 * the product's own Course or Event markup, which stays on its page.
 *
 * Built from the same listing the cards are drawn from, by the same selection,
 * so a list names the cards the section shows, in the admin's order: a pick
 * the listing no longer holds is in neither. **A municipality club's card is
 * drawn but never listed here**: its page, under `/schools`, is reachable and
 * never promoted, so it is never the URL of a structured-data node
 * (`docs/architecture/site-quality.md`); the list names the drawn cards whose
 * page is promoted, the shop's types. A section with none of those
 * contributes no list, and a failed listing read contributes none at all — an
 * empty list would assert that nothing is on offer while the cards may still
 * arrive. Each list is its own top-level node, beside the page's, as the shop
 * grid's is beside the shop page's. Each comes with its section's id, for the
 * page to key its blocks by.
 */
export function landingProductListsJsonLd({
  siteUrl,
  locale,
  page,
  listing,
}: LandingProductListsInput) {
  if (listing === null) return [];
  return landingStructuredParts(page.sections, page.sectionTexts).flatMap((part) => {
    if (part.kind !== "products") return [];
    const promoted = selectRailProducts(listing, {
      kind: "picks",
      productIds: part.productIds,
    }).filter((product) => SHOP_TYPES.has(product.product_type));
    const list = productItemList(promoted, locale, siteUrl);
    return list === null ? [] : [{ sectionId: part.sectionId, list }];
  });
}
