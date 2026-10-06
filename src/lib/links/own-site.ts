import { defaultUrlTransform } from "react-markdown";
import { authoredLinkKind } from "@/lib/authored-markdown";
import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";
import {
  canonicalPathForForeignSlug,
  localizeInternalPath,
  normalizeExternalPath,
  splitLocalePrefix,
} from "@/lib/navigation/locale-path";
import type { InternalPathname } from "@/i18n/pathnames";
import { parseIdOrSlug } from "@/lib/slug";

/**
 * **Links to our own site, stored without a language and shown in the
 * reader's.**
 *
 * A link an admin pastes carries whatever language they happened to be
 * browsing in — `/fi/kauppa/123`, `https://<site>/sv/butik/123`. Stored as
 * pasted, it pins every reader to that language. So an own-site link is stored
 * as its **internal route path** (`/shop/123`), the locale-less form the
 * filesystem declares, and localised to the page's locale when it is shown.
 *
 * **Own site** is the renderer's own test (`authoredLinkKind`): a relative
 * address, or an absolute one on `NEXT_PUBLIC_SITE_URL`'s host exactly — a
 * `www.` variant or another port is another site. One test, so a link the save
 * canonicalises is the same link the renderer opens in the same tab.
 *
 * **A page whose address is a per-language slug** — any route whose dynamic
 * segment is `[idOrSlug]` (a Library article, a team profile, a landing page)
 * — is stored at its **id** address, because a slug is only an address in the
 * language it was written in. Finding the id needs the database, so the pure
 * step here answers `slug` with what a resolver needs, and
 * `resolveSlugAddress` finishes the job with a resolver the caller injects.
 *
 * An own-site path that matches no route is `dead`, for a writer to refuse.
 */

/** The dynamic segment that takes either an id or a per-language slug. */
const SLUG_SEGMENT = "[idOrSlug]";

/** A base no real address shares, so a relative href resolves onto it. */
const RELATIVE_BASE = "https://relative.invalid";

/**
 * Finds the id a per-language slug addresses: the page of route `template`
 * whose `locale` version carries `slug`, or `null` when none does.
 */
export type SlugResolver = (
  template: InternalPathname,
  locale: SupportedLocale,
  slug: string,
) => Promise<string | null>;

/** A slug address waiting for its id. */
export interface SlugAddress {
  /** The internal route template, e.g. `/library/[idOrSlug]`. */
  template: InternalPathname;
  /** The language the slug belongs to: the URL's, or the one its segments are spelled in. */
  locale: SupportedLocale;
  slug: string;
  /** The internal pathname with the slug in place, e.g. `/library/my-article`. */
  pathname: string;
  /** The query and fragment, carried over as written (`?x=1#y`), or `""`. */
  suffix: string;
}

/**
 * Where an href goes, once its own-site form is canonical.
 *
 * - `internal` — our own site, at `path`: the locale-less internal route path
 *   with its query and fragment (`/shop/123?x=1#y`), or a same-page `#x` /
 *   `?x=1` left as written.
 * - `slug` — our own site, at a per-language slug address (`SlugAddress`).
 * - `dead` — our own site, at a path no route matches.
 * - `external` — another site, or a non-web scheme (`mailto:`); `href` is
 *   untouched.
 * - `unusable` — empty, unparseable, or a scheme the renderers blank
 *   (`javascript:`, `data:`).
 */
export type CanonicalHref =
  | { kind: "internal"; path: string }
  | { kind: "slug"; address: SlugAddress }
  | { kind: "dead" }
  | { kind: "external"; href: string }
  | { kind: "unusable" };

/** A `CanonicalHref` with every slug address resolved. */
export type ResolvedHref = Exclude<CanonicalHref, { kind: "slug" }>;

/** An own-site address split into the parts canonicalisation reads. */
interface OwnSiteParts {
  /** As the URL parser serialised it: percent-encoded, dot segments resolved. */
  pathname: string;
  search: string;
  hash: string;
}

type Classified =
  | { kind: "same-page"; href: string }
  | { kind: "own-site"; parts: OwnSiteParts }
  | { kind: "external"; href: string }
  | { kind: "unusable" };

function classify(href: string, siteUrl: string | undefined): Classified {
  const trimmed = href.trim();
  if (trimmed === "" || defaultUrlTransform(trimmed) === "") {
    return { kind: "unusable" };
  }
  let url: URL;
  try {
    url = new URL(trimmed, RELATIVE_BASE);
  } catch {
    return { kind: "unusable" };
  }
  if (authoredLinkKind(trimmed, siteUrl) !== "own-site") {
    return { kind: "external", href };
  }
  // A fragment or a query alone names no page: it stays on whichever page it
  // is shown on, so there is nothing to canonicalise or localise.
  if (trimmed.startsWith("#") || trimmed.startsWith("?")) {
    return { kind: "same-page", href: trimmed };
  }
  return {
    kind: "own-site",
    parts: { pathname: url.pathname, search: url.search, hash: url.hash },
  };
}

/** A path made URL-safe again: the normaliser hands back decoded segments. */
function serialized(pathname: string, suffix: string): string {
  const url = new URL(`${pathname}${suffix}`, RELATIVE_BASE);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * The language a bare path's segments are spelled in — the first locale, in
 * `SUPPORTED_LOCALES` order, whose slugs match it — so `/kirjasto/x` is a
 * Finnish slug and `/library/x` an English one.
 */
function spelledIn(rest: string, template: InternalPathname): SupportedLocale {
  for (const locale of SUPPORTED_LOCALES) {
    if (normalizeExternalPath(`/${locale}${rest}`).template === template) {
      return locale;
    }
  }
  return SUPPORTED_LOCALES[0];
}

type OwnSiteRoute =
  | {
      kind: "route";
      template: InternalPathname;
      /** Decoded, locale-less, slug untranslated. */
      pathname: string;
      /** The locale the URL carried, or its segments' language for a bare path. */
      locale: SupportedLocale;
      /** Whether the URL carried a locale prefix. */
      pinned: boolean;
    }
  | { kind: "dead" };

function routeOf(parts: OwnSiteParts): OwnSiteRoute {
  const own = normalizeExternalPath(parts.pathname);
  // A locale serving another locale's slug (`/fi/shop/1`) is redirected by the
  // site to its own (`/fi/kauppa/1`), so it leads somewhere too.
  const foreign =
    own.template === null ? canonicalPathForForeignSlug(parts.pathname) : null;
  const normalized = foreign === null ? own : normalizeExternalPath(foreign);
  if (normalized.template === null) return { kind: "dead" };
  return {
    kind: "route",
    template: normalized.template,
    pathname: normalized.pathname,
    locale:
      normalized.locale ??
      spelledIn(splitLocalePrefix(parts.pathname).rest, normalized.template),
    pinned: normalized.locale !== null,
  };
}

/** The slug in a matched route, or `null` when its segment is an id or it has none. */
function slugIn(template: InternalPathname, pathname: string): string | null {
  const index = template.split("/").indexOf(SLUG_SEGMENT);
  if (index === -1) return null;
  const segment = pathname.split("/").at(index);
  if (segment === undefined) return null;
  const address = parseIdOrSlug(segment);
  return "slug" in address ? address.slug : null;
}

function canonicalOwnSite(parts: OwnSiteParts): CanonicalHref {
  const route = routeOf(parts);
  if (route.kind === "dead") return { kind: "dead" };
  const suffix = `${parts.search}${parts.hash}`;
  const slug = slugIn(route.template, route.pathname);
  if (slug !== null) {
    return {
      kind: "slug",
      address: {
        template: route.template,
        locale: route.locale,
        slug,
        pathname: route.pathname,
        suffix,
      },
    };
  }
  return { kind: "internal", path: serialized(route.pathname, suffix) };
}

/**
 * **The canonical form of an href**, without the database: an own-site link
 * becomes its internal route path — `/fi/kauppa/123` and
 * `https://<site>/sv/butik/123?x=1#y` become `/shop/123` and
 * `/shop/123?x=1#y` — a slug address comes back for resolution, a path no
 * route matches is `dead`, and everything else is left as it is.
 *
 * `siteUrl` is the site's own origin; without one, only a relative address is
 * our own site.
 */
export function canonicalizeHref(
  href: string,
  siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL,
): CanonicalHref {
  const classified = classify(href, siteUrl);
  switch (classified.kind) {
    case "unusable":
      return { kind: "unusable" };
    case "external":
      return { kind: "external", href: classified.href };
    case "same-page":
      return { kind: "internal", path: classified.href };
    case "own-site":
      return canonicalOwnSite(classified.parts);
  }
}

/**
 * Finish a canonical href: a slug address becomes the id address of the page
 * it names (`/library/my-article` → `/library/<id>`), or `dead` when the
 * resolver finds no such page. Anything else passes through.
 */
export async function resolveSlugAddress(
  canonical: CanonicalHref,
  resolver: SlugResolver,
): Promise<ResolvedHref> {
  if (canonical.kind !== "slug") return canonical;
  const { template, locale, slug, pathname, suffix } = canonical.address;
  const id = await resolver(template, locale, slug);
  if (id === null) return { kind: "dead" };
  const index = template.split("/").indexOf(SLUG_SEGMENT);
  const segments = pathname.split("/");
  segments[index] = id;
  return { kind: "internal", path: serialized(segments.join("/"), suffix) };
}

/** `canonicalizeHref` and `resolveSlugAddress` in one step. */
export async function resolveCanonicalHref(
  href: string,
  resolver: SlugResolver,
  siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL,
): Promise<ResolvedHref> {
  return resolveSlugAddress(canonicalizeHref(href, siteUrl), resolver);
}

/**
 * Where an own-site href leads, in the form a renderer localises — or `null`
 * when it is not an own-site page address and is shown exactly as written
 * (another site, a non-web scheme, a same-page fragment, a path no route
 * matches, which may be a file such as `/llms.txt` rather than a page).
 *
 * `pinnedLocale` is set for a slug address alone: a slug is an address only
 * in its own language, so it keeps that language wherever it is shown.
 */
function ownSiteDestination(
  href: string,
  siteUrl: string | undefined,
): { pathname: string; suffix: string; pinnedLocale: SupportedLocale | null } | null {
  const classified = classify(href, siteUrl);
  if (classified.kind !== "own-site") return null;
  const { parts } = classified;
  const route = routeOf(parts);
  if (route.kind === "dead") return null;
  const slug = slugIn(route.template, route.pathname);
  return {
    pathname: route.pathname,
    suffix: `${parts.search}${parts.hash}`,
    pinnedLocale: slug === null ? null : route.locale,
  };
}

/**
 * **An own-site href in the reader's language**, for a page renderer: a
 * locale-less internal path gets `locale` and that locale's slugs
 * (`/shop/123` → `/fi/kauppa/123`), and a locale-pinned one is normalised
 * first and then localised the same way (`/sv/butik/123` on a Finnish page →
 * `/fi/kauppa/123`). The result is relative, whatever host the href named.
 *
 * Left as written: another site's address, a non-web scheme, a same-page
 * `#x`, and a path no route matches. A slug address keeps its own language,
 * the only one it resolves in.
 */
export function localizeOwnSiteHref(
  href: string,
  locale: SupportedLocale,
  siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL,
): string {
  const destination = ownSiteDestination(href, siteUrl);
  if (destination === null) return href;
  const { pathname, suffix, pinnedLocale } = destination;
  return serialized(localizeInternalPath(pathname, pinnedLocale ?? locale), suffix);
}

/**
 * **An own-site href as a mail writes it: absolute, and without a language**
 * (`/fi/kauppa/123` → `https://<site>/shop/123`). A mailed link is opened
 * outside any page, so it needs the site's origin, and it lands on the bare
 * path the way every server-built link does — the site then sends the reader
 * on in their own stored language. A slug address keeps its language, the
 * only one it resolves in; a path no route matches is made absolute as it is.
 *
 * Without a usable `siteUrl` the href is returned as written, there being no
 * origin to write.
 */
export function mailOwnSiteHref(
  href: string,
  siteUrl: string | undefined = process.env.NEXT_PUBLIC_SITE_URL,
): string {
  const origin = originOf(siteUrl);
  if (origin === null) return href;
  const classified = classify(href, siteUrl);
  if (classified.kind !== "own-site") return href;
  const destination = ownSiteDestination(href, siteUrl);
  if (destination === null) {
    const { pathname, search, hash } = classified.parts;
    return `${origin}${pathname}${search}${hash}`;
  }
  const { pathname, suffix, pinnedLocale } = destination;
  const path =
    pinnedLocale === null ? pathname : localizeInternalPath(pathname, pinnedLocale);
  return `${origin}${serialized(path, suffix)}`;
}

function originOf(siteUrl: string | undefined): string | null {
  if (siteUrl === undefined || siteUrl === "") return null;
  try {
    return new URL(siteUrl).origin;
  } catch {
    return null;
  }
}
