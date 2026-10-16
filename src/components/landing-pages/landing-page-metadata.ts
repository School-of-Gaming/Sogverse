import type { Metadata } from "next";
import { resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import { siteDocumentTitle } from "@/lib/metadata/site-title";
import { translatedPageMetadataAlternates } from "@/lib/metadata/translated-page";
import { ogCardImage } from "@/lib/og/card-metadata";
import { ogPictureImage } from "@/lib/og/picture";
import {
  localizeLandingPage,
  type PublishedLandingPage,
} from "@/services/landing-pages/landing-pages.contracts";
import { landingPagePaths } from "./landing-page-address";
import { landingLeadPicture } from "./landing-section-seo";

/*
 * **What a landing page tells search engines and link previews** — decided
 * once, here, by `landingPageSeo`, over a published copy. The page's
 * `generateMetadata` hands it to Next (`landingPageMetadata`), and the MCP
 * tools run the same function over the working copy as if it were published
 * and read it out as served (`renderedLandingSeo`), so what an AI app is told
 * the next publish will serve and what the page serves cannot drift apart.
 *
 * Landing pages are promoted (`docs/architecture/site-quality.md`), and every
 * affordance is the system's: the admin writes a title, a summary and a slug,
 * and nothing else.
 *
 * - **The title and description are the shown version's own** — its title and
 *   its summary, which the schema caps at a search result's length. The
 *   `<title>` is that title through the root layout's template
 *   (`SITE_TITLE_TEMPLATE`); the card's title is it bare.
 * - **The canonical and language versions follow the rule every page written
 *   per locale follows** (`src/lib/metadata/translated-page.ts`): the locales
 *   live are the language versions, each at its slug address, and a locale
 *   with no live version canonicalises to the slug address of the version it
 *   shows. `og:url` is the canonical.
 * - **The card is the hero's picture**, the one the page leads with
 *   (`landingLeadPicture`), served through the preview picture route with the
 *   shown version's alt text, else its title. A page whose hero has no picture
 *   takes the site-wide card, at the request's locale. Either is restated
 *   rather than inherited because Next assigns a child's `openGraph` and
 *   `twitter` over the layout's, dropping its image; `siteName` and `type` are
 *   restated for the same reason. `og:locale` is the language of the version
 *   whose words the card carries.
 */

/** One Open Graph / Twitter image entry, its URL relative to the site's origin. */
export interface LandingCardImage {
  url: string;
  alt: string;
  width: number;
  height: number;
}

/** The site-wide card at a locale; a page reads it from the catalog (`ogCardImage`). */
export type SiteCardImage = (locale: SupportedLocale) => Promise<LandingCardImage>;

/** Everything a landing page's metadata is made of, read at one locale. */
export interface LandingPageSeo {
  /** The shown version's own title: the card's title, and the `<title>` through the template. */
  title: string;
  /** The shown version's summary: the meta description and the card's. */
  description: string;
  /** The canonical and the `hreflang` set, as paths on the site's origin. */
  alternates: { canonical: string; languages?: Record<string, string> };
  /** The language of the version whose words the card carries. */
  locale: SupportedLocale;
  image: LandingCardImage;
  /** Whether the card's picture is the hero's or the site-wide card. */
  imageSource: "hero" | "site-card";
}

/**
 * The page's metadata read at `requestLocale`, or null for a page with no
 * version — which a published one never is.
 */
export async function landingPageSeo(
  page: PublishedLandingPage,
  requestLocale: string,
  siteCard: SiteCardImage = (locale) => ogCardImage("site", locale),
): Promise<LandingPageSeo | null> {
  const locale = resolveLocale(requestLocale);
  const shown = localizeLandingPage(page, locale);
  if (shown === null) return null;
  const { title, summary: description } = shown;
  const picture = landingLeadPicture(shown);
  return {
    title,
    description,
    alternates: translatedPageMetadataAlternates(page.versions, locale, landingPagePaths(page)),
    locale: shown.locale,
    image:
      picture === null
        ? await siteCard(locale)
        : ogPictureImage("landing_image", picture.path, picture.alt ?? title),
    imageSource: picture === null ? "site-card" : "hero",
  };
}

/** The metadata Next is handed for `seo`. */
export function landingSeoMetadata(seo: LandingPageSeo): Metadata {
  const { title, description, alternates, image } = seo;
  return {
    title,
    description,
    alternates,
    openGraph: {
      type: "website",
      siteName: "School of Gaming",
      locale: seo.locale,
      url: alternates.canonical,
      title,
      description,
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

/** A live landing page's metadata, read at `requestLocale`: its `generateMetadata`. */
export async function landingPageMetadata(
  page: PublishedLandingPage,
  requestLocale: string,
): Promise<Metadata> {
  const seo = await landingPageSeo(page, requestLocale);
  return seo === null ? {} : landingSeoMetadata(seo);
}

/**
 * **What a crawler or a link preview reads off the served page**: `seo` with
 * the layout's title template applied and every address made absolute on
 * `siteUrl`, the layout's `metadataBase`.
 */
export interface RenderedLandingSeo {
  /** The `<title>`, the site's suffix included. */
  title: string;
  /** Its length in characters; a search result cuts a long one short. */
  titleLength: number;
  /** The meta description. */
  description: string;
  canonical: string;
  /** Each language version's address and `x-default`; empty when there are none. */
  hreflang: Record<string, string>;
  /** What a chat or a feed shows where the page is shared: `og:` and `twitter:` alike. */
  shareCard: {
    title: string;
    description: string;
    imageUrl: string;
    imageAlt: string;
    /** `hero` for the hero's picture, `site-card` for the site-wide card. */
    image: LandingPageSeo["imageSource"];
  };
}

export function renderedLandingSeo(seo: LandingPageSeo, siteUrl: string): RenderedLandingSeo {
  const absolute = (path: string) => new URL(path, siteUrl).href;
  const title = siteDocumentTitle(seo.title);
  return {
    title,
    titleLength: [...title].length,
    description: seo.description,
    canonical: absolute(seo.alternates.canonical),
    hreflang: Object.fromEntries(
      Object.entries(seo.alternates.languages ?? {}).map(([lang, path]) => [lang, absolute(path)]),
    ),
    shareCard: {
      title: seo.title,
      description: seo.description,
      imageUrl: absolute(seo.image.url),
      imageAlt: seo.image.alt,
      image: seo.imageSource,
    },
  };
}
