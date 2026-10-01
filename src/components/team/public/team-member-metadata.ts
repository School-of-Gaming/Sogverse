import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { INDEXED_LOCALES } from "@/lib/metadata/localized-page";
import { ogCardImage } from "@/lib/og/card-metadata";
import { organizationId } from "@/lib/seo/organization";
import type { TeamProfile } from "@/services/team-profiles/team-profiles.types";

/*
 * A person's page as crawlers and link previews meet it. The Team pages are
 * promoted (`docs/architecture/discoverability.md`), so a profile carries a
 * canonical, its language versions and a `ProfilePage`.
 *
 * **A person writes in the languages they choose, and the page follows the
 * Library's rule for the rest**: a locale they did not write shows the
 * fallback text — the reader's locale, then English, then the first written,
 * through `resolveTranslation()` as the body does — and canonicalises to the
 * address of the locale whose text it shows. So only the locales they wrote
 * are language versions, and each of those is its own canonical.
 */

/** The locale whose words the page shows at this locale: its own when written, else the fallback's. */
export function teamMemberTextLocale(
  person: TeamProfile,
  locale: SupportedLocale,
): SupportedLocale {
  return resolveTranslation(person.translations, locale)?.locale ?? locale;
}

/**
 * The person's address at a locale, from the pathnames map — `/fi/tiimi/<slug>`
 * — so a translated segment and its `hreflang` cannot disagree.
 */
function addressAt(address: string, locale: SupportedLocale): string {
  return getPathname({ href: ROUTES.teamMember(address), locale });
}

/**
 * The canonical path of the person's page read at `locale`: their canonical
 * address (`teamMemberAddress`) at the locale whose words the page shows.
 */
export function teamMemberCanonicalPath(
  person: TeamProfile,
  address: string,
  locale: SupportedLocale,
): string {
  return addressAt(address, teamMemberTextLocale(person, locale));
}

/**
 * The language versions a person's page has: one per indexed locale they
 * wrote, in the site's locale order. Klingon is never one (`INDEXED_LOCALES`).
 * The sitemap lists exactly these.
 */
export function teamMemberLocales(person: TeamProfile): SupportedLocale[] {
  return INDEXED_LOCALES.filter((locale) =>
    person.translations.some((row) => row.locale === locale),
  );
}

/**
 * The `hreflang` set: each written, indexed locale at its own address, and
 * `x-default` at the page a reader in any other language is shown — the one
 * English resolves to, since an unmatched language lands on English. Empty
 * when the person wrote in no indexed locale, which then has no versions to
 * annotate.
 */
export function teamMemberAlternates(
  person: TeamProfile,
  address: string,
): Record<string, string> {
  const locales = teamMemberLocales(person);
  if (locales.length === 0) return {};
  return {
    ...Object.fromEntries(
      locales.map((locale) => [locale, addressAt(address, locale)]),
    ),
    "x-default": teamMemberCanonicalPath(person, address, "en"),
  };
}

/**
 * A person's page metadata.
 *
 * - **The title is the name as the heading shows it** (`name`, plain text),
 *   under the site's title template. The description is their one-line intro
 *   in the words the page shows.
 * - **The card is the site-wide card** at the request's locale, for now: a
 *   portrait photo crops badly to a link preview's wide frame. It has to be
 *   stated, because Next assigns a child's `openGraph` and `twitter` over the
 *   layout's rather than merging them; `siteName` is restated for the same
 *   reason. `og:type` is `profile`, with the names the page shows — a Gedu's
 *   first name and nickname, an admin's surname too.
 */
export async function teamMemberMetadata({
  person,
  address,
  requestLocale,
  name,
}: {
  person: TeamProfile;
  /** The person's canonical address segment (`teamMemberAddress`). */
  address: string;
  requestLocale: string;
  /** The name as the page's heading shows it, as plain text. */
  name: string;
}): Promise<Metadata> {
  const locale = resolveLocale(requestLocale);
  const written = resolveTranslation(person.translations, locale);
  const description = written?.shortDescription;
  const canonical = teamMemberCanonicalPath(person, address, locale);
  const languages = teamMemberAlternates(person, address);
  const card = await ogCardImage("site", locale);

  return {
    title: name,
    description,
    alternates: {
      canonical,
      ...(Object.keys(languages).length > 0 && { languages }),
    },
    openGraph: {
      type: "profile",
      siteName: "School of Gaming",
      locale: written?.locale ?? locale,
      url: canonical,
      title: name,
      description,
      images: [card],
      firstName: person.firstName,
      ...(person.kind === "admin" && { lastName: person.lastName }),
      ...(person.nickname !== null && { username: person.nickname }),
    },
    twitter: {
      card: "summary_large_image",
      title: name,
      description,
      images: [card],
    },
  };
}

export interface TeamMemberJsonLdInput {
  /** The canonical site origin — `NEXT_PUBLIC_SITE_URL`. */
  siteUrl: string;
  /** The page's canonical path (`teamMemberCanonicalPath`). */
  canonicalPath: string;
  person: TeamProfile;
  /** The title line as the page shows it: an admin's own, a Gedu's role. */
  jobTitle: string;
  /** The locale the page is read at. */
  locale: SupportedLocale;
}

/**
 * **A person's page as a schema.org `ProfilePage` about a `Person`** — built
 * only from the profile the page itself renders, so it cannot assert anything
 * the page does not show.
 *
 * - The `name` is the name as shown — a Gedu's first name alone, an admin's
 *   full name — with the nickname as `alternateName`.
 * - `jobTitle` is the page's title line; `description` the one-line intro in
 *   the words the page shows, whose locale is the page's `inLanguage`.
 * - The `image` is the photo at its absolute address, the one the page
 *   draws, served only while the profile is public.
 * - `knowsLanguage` is the languages the page lists under "Speaks".
 * - `worksFor` is School of Gaming by the `@id` of the layout's
 *   `Organization`, so a consumer joins the two instead of meeting a second
 *   company.
 *
 * Pure, so the whole shape is assertable without rendering a page.
 */
export function teamMemberJsonLd({
  siteUrl,
  canonicalPath,
  person,
  jobTitle,
  locale,
}: TeamMemberJsonLdInput) {
  const url = `${siteUrl}${canonicalPath}`;
  const written = resolveTranslation(person.translations, locale);

  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url,
    inLanguage: written?.locale ?? locale,
    mainEntity: {
      "@type": "Person",
      name:
        person.kind === "admin"
          ? `${person.firstName} ${person.lastName}`
          : person.firstName,
      ...(person.nickname !== null && { alternateName: person.nickname }),
      jobTitle,
      ...(written !== null && { description: written.shortDescription }),
      ...(person.photo !== null && { image: `${siteUrl}${person.photo.src}` }),
      ...(person.spokenLanguages.length > 0 && {
        knowsLanguage: [...person.spokenLanguages],
      }),
      worksFor: {
        "@type": "Organization",
        "@id": organizationId(siteUrl),
        name: "School of Gaming",
      },
    },
  };
}
