import { getPathname } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";
import {
  translatedCanonicalPath,
  translatedPageLocales,
  type TranslatedPagePath,
} from "@/lib/metadata/translated-page";
import { resolveIdOrSlug } from "@/lib/slug";

/*
 * **Where a landing page lives — every link to one is built here.** Two
 * addresses, neither redirecting: `<discover>/<id>`, which resolves in every
 * locale, and `<discover>/<slug>`, the one people share and the canonical.
 *
 * **A slug is stored, per language, and resolves in its own locale only** —
 * a Finnish version's slug under `/fi/tutustu`, never under `/en/discover`.
 * Slugs are unique per locale and never shaped like an id, so, unlike the
 * Library's derived slugs, there is no contest over who owns one: a locale's
 * address is its live version's slug, or the id where the page has no live
 * version in that locale.
 */

/** What an address is judged on: the page's id and its live versions' slugs. */
export interface AddressableLandingPage {
  id: string;
  versions: readonly { locale: SupportedLocale; slug: string }[];
}

/** The path segment of the page's address in `locale`: its slug there, else its id. */
export function landingPageAddress(
  page: AddressableLandingPage,
  locale: SupportedLocale,
): string {
  const slug = page.versions.find((version) => version.locale === locale)?.slug;
  return slug !== undefined && slug !== "" ? slug : page.id;
}

/** The typed href of the page in `locale`, for the wrapped `Link`. */
export function landingPageHref(
  page: AddressableLandingPage,
  locale: SupportedLocale,
) {
  return ROUTES.landingPage(landingPageAddress(page, locale));
}

/** The page's locale-prefixed path in `locale`, from the pathnames map — `/fi/tutustu/<slug>`. */
export function landingPagePath(
  page: AddressableLandingPage,
  locale: SupportedLocale,
): string {
  return getPathname({ href: landingPageHref(page, locale), locale });
}

/** The page's path at each locale, as the canonical and `hreflang` rule reads it. */
export function landingPagePaths(page: AddressableLandingPage): TranslatedPagePath {
  return (locale) => landingPagePath(page, locale);
}

/**
 * The page's path in every locale, for the locale picker: its slug address
 * where it is written, its id address elsewhere — so a switch to any locale
 * lands on this page rather than on a slug that locale does not know.
 */
export function landingPageLocalePaths(
  page: AddressableLandingPage,
): Partial<Record<SupportedLocale, string>> {
  const paths: Partial<Record<SupportedLocale, string>> = {};
  for (const locale of SUPPORTED_LOCALES) paths[locale] = landingPagePath(page, locale);
  return paths;
}

/**
 * The canonical path of the page read at `locale`: the slug address of the
 * version shown there (`src/lib/metadata/translated-page.ts`).
 */
export function landingPageCanonicalPath(
  page: AddressableLandingPage,
  locale: SupportedLocale,
): string {
  return translatedCanonicalPath(page.versions, locale, landingPagePaths(page));
}

/** The page's language versions: each indexed locale it is live in. The sitemap lists exactly these. */
export function landingPageLocales(
  page: Pick<AddressableLandingPage, "versions">,
): SupportedLocale[] {
  return translatedPageLocales(page.versions);
}

/** The two reads an address resolves through. */
export interface LandingPageLookups<Page> {
  byId: (id: string) => Promise<Page | null>;
  bySlug: (locale: SupportedLocale, slug: string) => Promise<Page | null>;
}

/**
 * The page a path segment names at `locale`, or null: a uuid by its id, in
 * any locale; anything else as a slug of `locale`'s own version alone.
 */
export function resolveLandingPage<Page>(
  segment: string,
  locale: SupportedLocale,
  lookups: LandingPageLookups<Page>,
): Promise<Page | null> {
  return resolveIdOrSlug<Page>(segment, {
    byId: lookups.byId,
    bySlug: (slug) => lookups.bySlug(locale, slug),
  });
}
