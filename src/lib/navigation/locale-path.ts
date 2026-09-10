/**
 * External ⇄ internal pathname translation, derived from the routing pathnames
 * map and nothing else.
 *
 * An **external** pathname is what is in the address bar: locale-prefixed, with
 * the slug that locale serves (`/fi/kauppa/abc`). An **internal** pathname is
 * what the filesystem under `src/app/[locale]/` declares and what every route
 * check in this repo was written against (`/shop/abc`).
 *
 * **Every pathname check in the proxy runs against the internal form.**
 * Unstripped, `/fi/admin` sails past the `/admin` role gate; unstripped *and*
 * untranslated, `/fr/boutique` never matches the public-route list. That is the
 * whole reason this module exists, and it is why it is pure data with no
 * framework imports: the proxy, the post-auth allowlist and the analytics route
 * derivation all need it, on both sides of the network.
 *
 * **Nothing here assumes a locale segment is two letters.** A prefix is
 * recognised by membership in the locale list, never by shape, so a future
 * `es-mx` is one entry in that list rather than a regex nobody remembers to
 * widen.
 */

import {
  SUPPORTED_LOCALES,
  isSupportedLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { PATHNAMES, type InternalPathname } from "@/i18n/pathnames";

function segmentsOf(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function isDynamic(segment: string): boolean {
  return segment.startsWith("[") && segment.endsWith("]");
}

/**
 * Static segments outrank dynamic ones at the same position, so
 * `/shop/confirmation` is tried before `/shop/[id]` — the App Router's own
 * precedence, restated here because a map's key order must not decide which
 * route a URL resolves to.
 */
function compareTemplates(a: string, b: string): number {
  const sa = segmentsOf(a);
  const sb = segmentsOf(b);
  for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
    const da = isDynamic(sa[i]);
    const db = isDynamic(sb[i]);
    if (da !== db) return da ? 1 : -1;
  }
  return sb.length - sa.length;
}

/** Whether a string is one of the map's own keys. */
function isInternalPathname(value: string): value is InternalPathname {
  return Object.hasOwn(PATHNAMES, value);
}

const INTERNAL_TEMPLATES: InternalPathname[] = Object.keys(PATHNAMES)
  .filter(isInternalPathname)
  .sort(compareTemplates);

/** The external template a locale serves an internal route under. */
export function externalTemplateFor(
  internal: InternalPathname,
  locale: SupportedLocale,
): string {
  const entry: string | Record<SupportedLocale, string> = PATHNAMES[internal];
  return typeof entry === "string" ? entry : entry[locale];
}

/**
 * Match a concrete pathname against a route template, returning the dynamic
 * segments it bound keyed by param name, or `null` when it does not match.
 *
 * **Keyed by name, not by position**, so a locale is free to reorder segments
 * in a translated slug without silently swapping two params' values.
 */
function matchTemplate(
  pathname: string,
  template: string,
): Record<string, string> | null {
  const path = segmentsOf(pathname);
  const tpl = segmentsOf(template);
  if (path.length !== tpl.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < tpl.length; i++) {
    if (isDynamic(tpl[i])) {
      params[tpl[i].slice(1, -1)] = path[i];
      continue;
    }
    if (tpl[i] !== path[i]) return null;
  }
  return params;
}

/** Fill a template's dynamic segments from a param map. */
function fillTemplate(template: string, params: Record<string, string>): string {
  return `/${segmentsOf(template)
    .map((segment) =>
      isDynamic(segment) ? (params[segment.slice(1, -1)] ?? segment) : segment,
    )
    .join("/")}`;
}

export interface NormalizedPath {
  /** The locale the URL carried, or `null` when it carried none (a bare path). */
  locale: SupportedLocale | null;
  /**
   * The pathname with the locale prefix removed and the slug untranslated —
   * what every route check matches against. A path matching no template comes
   * back unchanged (minus its prefix), so an unknown URL is still checked and
   * still 404s in the visitor's own locale.
   */
  pathname: string;
  /** The internal route template that matched, or `null` for an unknown path. */
  template: InternalPathname | null;
}

/** Split a leading locale segment off a pathname. Shape is never consulted. */
export function splitLocalePrefix(pathname: string): {
  locale: SupportedLocale | null;
  rest: string;
} {
  const segments = segmentsOf(pathname);
  const first = segments[0];
  if (isSupportedLocale(first)) {
    return { locale: first, rest: `/${segments.slice(1).join("/")}` };
  }
  return { locale: null, rest: `/${segments.join("/")}` };
}

/**
 * Strip the locale prefix and untranslate the slug: `/fi/kauppa/abc` →
 * `{ locale: "fi", pathname: "/shop/abc", template: "/shop/[id]" }`.
 *
 * When the path carries no locale prefix the slug is untranslated against
 * *every* locale, so a bare translated path (`/kauppa`) still resolves — that
 * is what lets the bare-path ladder hand a Finnish reader `/fi/kauppa` instead
 * of a 404.
 */
export function normalizeExternalPath(pathname: string): NormalizedPath {
  const { locale, rest } = splitLocalePrefix(pathname);
  const candidateLocales: readonly SupportedLocale[] =
    locale === null ? SUPPORTED_LOCALES : [locale];

  for (const internal of INTERNAL_TEMPLATES) {
    for (const candidate of candidateLocales) {
      const params = matchTemplate(
        rest,
        externalTemplateFor(internal, candidate),
      );
      if (!params) continue;
      return { locale, pathname: fillTemplate(internal, params), template: internal };
    }
  }

  return { locale, pathname: rest, template: null };
}

/**
 * The pathname alone, for the many call sites that only need the value a route
 * check is run against.
 */
export function toInternalPathname(pathname: string): string {
  return normalizeExternalPath(pathname).pathname;
}

/**
 * The inverse: an internal pathname (concrete values, not a template) becomes
 * the external, locale-prefixed URL for that locale — `/shop/abc` + `fi` →
 * `/fi/kauppa/abc`.
 *
 * **A path matching no template is prefixed anyway**, so an unknown URL gives a
 * Finnish visitor a Finnish 404 rather than an English one.
 */
export function localizeInternalPath(
  pathname: string,
  locale: SupportedLocale,
): string {
  for (const internal of INTERNAL_TEMPLATES) {
    const params = matchTemplate(pathname, internal);
    if (!params) continue;
    const external = fillTemplate(externalTemplateFor(internal, locale), params);
    return `/${[locale, ...segmentsOf(external)].join("/")}`;
  }
  return `/${[locale, ...segmentsOf(pathname)].join("/")}`;
}
