import { getPathname } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants/routes";
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
  // exact-locale: a slug resolves only in its own locale
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
 * The query parameter on a landing page's address that says the reader has
 * just confirmed an email sign-up: the double opt-in's confirmation link
 * brings them back with it, and the sign-up section then thanks them in
 * place of its form.
 */
export const LANDING_SUBSCRIBED_PARAM = "subscribed";

/** The id a sign-up section's element carries, so an address can scroll to it. */
export function landingSubscribeAnchor(sectionId: string): string {
  return `signup-${sectionId}`;
}

/**
 * Where a reader lands after confirming an email sign-up made on this page:
 * the page in `locale`, saying they confirmed, scrolled to the section they
 * signed up from. A path — the caller puts it on a trusted origin. It is the
 * id address, never the slug: the link is mailed and followed later, and a
 * slug renamed in between would leave it pointing at nothing.
 */
export function landingPageSubscribedPath(
  pageId: string,
  locale: SupportedLocale,
  sectionId: string,
): string {
  const path = getPathname({ href: ROUTES.landingPage(pageId), locale });
  return `${path}?${LANDING_SUBSCRIBED_PARAM}=1#${landingSubscribeAnchor(sectionId)}`;
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
