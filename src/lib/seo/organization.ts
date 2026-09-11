import { SUPPORT_EMAIL } from "@/lib/constants";
import { INDEXED_LOCALES } from "@/lib/metadata/localized-page";

/**
 * The site-wide structured data: who we are, and what this site is.
 *
 * Emitted once, from the `[locale]` layout, as a single `@graph` — one script
 * block holding both nodes rather than two blocks each holding one. A graph is
 * what lets the `WebSite` name the `Organization` as its publisher by `@id`
 * instead of restating the company inside it, and it is the shape a consumer
 * expects when two nodes describe the same site.
 *
 * **The facts here are the company's, and they are load-bearing:** the legal
 * name, the Business ID's VAT form and the country are what let a search engine
 * or an assistant tie this site to the real Finnish entity behind it rather
 * than guessing. They are written here rather than translated, because a
 * company's registered name is not a string that has a French version.
 *
 * **`sameAs` lists only profiles the owner has confirmed are ours** (below).
 * The property corroborates the identity, so it is only worth anything if
 * every URL in it is really ours; a guessed or a dead one is worse than none.
 * How often a profile is posted to does not matter here — the claim is "this
 * is the same entity", not "this is active".
 */

/**
 * The company's own public profiles, confirmed by the owner on 2026-09-10.
 * The Oulu Facebook page (`facebook.com/sogsuomi`) was left out: it no longer
 * resolves for a visitor, and a `sameAs` that 404s is a corroboration that
 * fails. The Discord server is invite-only and has no public URL to list;
 * there is no TikTok and no X account.
 *
 * The legacy marketing site leads the list on purpose. Search engines' notion
 * of the School of Gaming entity is attached to it today, and this entry says
 * the Organization published here is that same entity — the hand-over the
 * discoverability doc's first backlog item is about. It goes when the host is
 * retired, or stays harmlessly once the host redirects here.
 */
export const SAME_AS = [
  "https://www.sog.gg/",
  "https://www.instagram.com/sog_suomi/",
  "https://www.facebook.com/sogversum",
  "https://www.youtube.com/@SchoolofGamingSuomi",
  "https://fi.linkedin.com/company/school-of-gaming",
  "https://www.eventbrite.com/o/school-of-gaming-galactic-oy-107212050481",
  "https://www.crunchbase.com/organization/school-of-gaming",
] as const;

/**
 * The company facts, exported because two surfaces state them — this graph and
 * `/llms.txt` — and a fact typed out twice is a fact that will one day differ.
 * They are constants rather than message keys because a registered name, a
 * Business ID and a VAT number have no French version.
 */

/** The registered entity behind the brand. */
export const LEGAL_NAME = "School of Gaming Galactic Oy";

/** The Finnish Business ID, in the form Finnish-facing copy states it. */
export const BUSINESS_ID = "3110461-1";

/**
 * The VAT identifier derived from the Business ID — the same number, in the
 * form the rest of the EU reads. `vatID` takes the international form; the
 * bare Business ID is what appears in Finnish-facing legal copy.
 */
export const VAT_ID = "FI31104611";

/** The country the company is registered in, as an ISO 3166-1 alpha-2 code. */
export const COUNTRY = "FI";

/**
 * The Apple touch icon, at an absolute URL.
 *
 * It is the logo rather than `icon.svg` because a consumer of `logo` wants a
 * raster it can place: Google's own guidance for the property asks for a
 * `.jpg`/`.png`/`.gif`, and an SVG is routinely skipped. The two files draw the
 * same mark, so this costs nothing but the format. The OG card is not a
 * candidate — it is a 1200×630 composition with a tagline and a sentence of
 * copy drawn into it, which is a share preview, not a logo.
 */
const LOGO_PATH = "/apple-icon.png";

export interface SiteJsonLdInput {
  /** The canonical site origin — `NEXT_PUBLIC_SITE_URL`. */
  siteUrl: string;
  /** The site description, already resolved at the request's locale. */
  description: string;
}

interface OrganizationNode {
  "@type": "Organization";
  "@id": string;
  name: string;
  legalName: string;
  url: string;
  logo: string;
  email: string;
  address: { "@type": "PostalAddress"; addressCountry: string };
  vatID: string;
  sameAs: string[];
}

interface WebSiteNode {
  "@type": "WebSite";
  "@id": string;
  name: string;
  url: string;
  inLanguage: string[];
  description: string;
  publisher: { "@id": string };
}

/**
 * The `@graph` the layout hands to `<JsonLd>`. Pure, so the whole shape is
 * assertable without rendering a page — and the graph is typed as the ordered
 * pair it is rather than an array of "one or the other", so a reader (a test
 * included) gets at each node's own fields without an assertion.
 */
export function siteJsonLd({ siteUrl, description }: SiteJsonLdInput): {
  "@context": string;
  "@graph": [OrganizationNode, WebSiteNode];
} {
  const organizationId = `${siteUrl}/#organization`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        // The brand, not the platform: this is the name a stranger meeting us
        // in a search result or an AI answer has any chance of recognising
        // (`src/CLAUDE.md` § Brand vs. Platform). `legalName` carries the
        // registered entity beside it.
        name: "School of Gaming",
        legalName: LEGAL_NAME,
        url: siteUrl,
        logo: `${siteUrl}${LOGO_PATH}`,
        email: SUPPORT_EMAIL,
        address: { "@type": "PostalAddress", addressCountry: COUNTRY },
        vatID: VAT_ID,
        sameAs: [...SAME_AS],
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: "School of Gaming",
        url: siteUrl,
        // The languages this site is *published* in — which is the indexed set,
        // not every locale that resolves. Klingon has working URLs and is
        // excluded from `hreflang` and the sitemap for the reason stated on
        // `INDEXED_LOCALES`; telling a consumer the site is available in
        // Klingon would contradict both.
        inLanguage: [...INDEXED_LOCALES],
        description,
        publisher: { "@id": organizationId },
      },
    ],
  };
}
