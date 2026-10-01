import type { Metadata } from "next";
import { getPathname } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  translatedCanonicalPath,
  translatedPageLocales,
  translatedPageMetadataAlternates,
  type TranslatedPagePath,
} from "@/lib/metadata/translated-page";
import { teamCardImage } from "@/lib/og/card-metadata";
import { organizationId } from "@/lib/seo/organization";
import type { TeamProfile } from "@/services/team-profiles/team-profiles.types";

/*
 * A person's page as crawlers and link previews meet it. The Team pages are
 * promoted (`docs/architecture/discoverability.md`), so a profile carries a
 * canonical, its language versions and a `ProfilePage`.
 *
 * **A person writes in the languages they choose, and the page follows the
 * rule every page written per locale follows**
 * (`src/lib/metadata/translated-page.ts`): the locales they wrote are its
 * language versions, and a locale they did not write canonicalises to the
 * address of the locale whose text it shows.
 */

/**
 * The person's address at a locale, from the pathnames map — `/fi/tiimi/<slug>`
 * — so a translated segment and its `hreflang` cannot disagree.
 */
function pathsOf(address: string): TranslatedPagePath {
  return (locale) => getPathname({ href: ROUTES.teamMember(address), locale });
}

/**
 * The canonical path of the person's page read at `locale`: their canonical
 * address (`teamMemberAddress`) at the locale whose words the page shows, or
 * at `locale` itself when those words are in a locale that is not indexed.
 */
export function teamMemberCanonicalPath(
  person: TeamProfile,
  address: string,
  locale: SupportedLocale,
): string {
  return translatedCanonicalPath(person.translations, locale, pathsOf(address));
}

/**
 * The language versions a person's page has: one per indexed locale they
 * wrote, in the site's locale order. The sitemap lists exactly these.
 */
export function teamMemberLocales(person: TeamProfile): SupportedLocale[] {
  return translatedPageLocales(person.translations);
}

/**
 * A person's page metadata.
 *
 * - **The title is the person's full name** (`name`, plain text): the
 *   heading's first name and nickname, and an admin's surname too, which the
 *   page shows on the line under the heading. A title stands alone in a
 *   search result or a tab, so it names the person in full. The description is their one-line intro
 *   in the words the page shows.
 * - **The card is the person's own** (`/opengraph-images/team/<id>`) at the
 *   request's locale, drawn for a link preview's wide frame rather than the
 *   portrait cropped into it. It has to be stated, because Next assigns a
 *   child's `openGraph` and `twitter` over the layout's rather than merging
 *   them; `siteName` is restated for the same reason. `og:type` is `profile`,
 *   with the names the page shows — a Gedu's first name and nickname, an
 *   admin's surname too.
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
  /** The person's full name, as plain text (`teamMemberPlainName`). */
  name: string;
}): Promise<Metadata> {
  const locale = resolveLocale(requestLocale);
  const written = resolveTranslation(person.translations, locale);
  const description = written?.shortDescription;
  const alternates = translatedPageMetadataAlternates(
    person.translations,
    locale,
    pathsOf(address),
  );
  const { canonical } = alternates;
  const card = await teamCardImage(person, locale, name);

  return {
    title: name,
    description,
    alternates,
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
