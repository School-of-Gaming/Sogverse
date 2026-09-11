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
 *
 * **One string, matched by both ends.** Next.js hands the proxy a pathname
 * still percent-encoded, while next-intl's middleware opens by decoding and
 * sanitizing it — so a check run against the raw form and a rewrite run against
 * the decoded one are reasoning about two different URLs, and the gap is a
 * gate bypass (`/fi/%61dmin` matches no `/admin` prefix here and rewrites into
 * the admin tree there). Everything in this module therefore normalizes
 * through `decodeExternalPathname`, which reproduces next-intl's own opening
 * moves exactly.
 */

import {
  SUPPORTED_LOCALES,
  isSupportedLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { PATHNAMES, type InternalPathname } from "@/i18n/pathnames";

/**
 * The pathname as next-intl's middleware will see it, or `null` when it is
 * malformed.
 *
 * Verified against the installed implementation (4.9.x), whose first two
 * statements this mirrors line for line:
 *
 * - **`decodeURI`**, so `/fi/%61dmin` and `/fi/admin` are one string. It leaves
 *   the reserved set encoded, `%2F` included — so a `%2F` inside a segment is
 *   *not* a separator, here or there, and `/fi%2Fadmin` is one opaque segment
 *   that carries no locale prefix at either end.
 * - **`sanitizePathname`**, which escapes backslashes, drops the three
 *   whitespace characters the WHATWG URL parser strips (`\t\n\r`), and
 *   collapses runs of slashes. That last pair is not cosmetic: an encoded TAB
 *   in `/fi/%09admin` decodes to a character next-intl deletes, so without this
 *   the rewrite would resolve `/fi/admin` while this module was still matching
 *   a path with a control character wedged into it.
 *
 * `null` is the malformed case — a lone `%` or a bad escape, which `decodeURI`
 * throws on. next-intl answers it by forwarding to Next.js, which replies 400;
 * the proxy mirrors that outcome rather than guessing at a path it cannot read.
 */
export function decodeExternalPathname(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURI(pathname);
  } catch {
    return null;
  }
  return decoded
    .replace(/\\/g, "%5C")
    .replace(/[\t\n\r]/g, "")
    .replace(/\/+/g, "/");
}

/**
 * Fail closed: an undecodable pathname is matched in its raw form, which no
 * template and no locale prefix can match, so it is never treated as public
 * and never resolves to an internal route. The proxy refuses it outright
 * before that matters.
 */
function readable(pathname: string): string {
  return decodeExternalPathname(pathname) ?? pathname;
}

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

/**
 * Split a leading locale segment off a pathname. Shape is never consulted.
 *
 * **Matched case-insensitively, and answered with the canonical casing** —
 * next-intl matches its own prefixes with an `i` flag, so `/FI/admin` is the
 * Finnish prefix to the rewrite whatever this module thinks. Reading it as a
 * bare path here would leave the proxy gating `/FI/admin` (which matches no
 * role prefix) while next-intl resolved `/fi/admin`, which is the same
 * two-strings-one-URL bug the decode above closes.
 */
export function splitLocalePrefix(pathname: string): {
  locale: SupportedLocale | null;
  rest: string;
} {
  const segments = segmentsOf(readable(pathname));
  const first = segments[0]?.toLowerCase();
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
 * A URL whose locale does not serve the slug it carries, resolved to the path
 * that locale *does* serve it under — `/sv/kauppa` → `/sv/butik` — or `null`
 * when the URL is not that shape.
 *
 * next-intl redirects this case itself, but it does so *after* the proxy's
 * gates have already run against a pathname that matched nothing. That split
 * the behaviour by auth state: an anonymous reader was bounced to login
 * (`/kauppa` is not in the public-route list) while a signed-in one sailed
 * through to the rewrite and got the redirect. Answering it here, before the
 * gates, makes it one behaviour for everyone.
 *
 * **Only a translated public route can be this shape.** Dashboards, auth and
 * settings are declared as one string for every locale, so their template is
 * the same in the URL's own locale and there is nothing foreign to match —
 * which is what keeps this branch from ever standing in front of a gate.
 */
export function canonicalPathForForeignSlug(pathname: string): string | null {
  const own = normalizeExternalPath(pathname);
  if (own.locale === null || own.template !== null) return null;
  const { rest } = splitLocalePrefix(pathname);

  for (const internal of INTERNAL_TEMPLATES) {
    for (const candidate of SUPPORTED_LOCALES) {
      if (candidate === own.locale) continue;
      const params = matchTemplate(
        rest,
        externalTemplateFor(internal, candidate),
      );
      if (!params) continue;
      return localizeInternalPath(fillTemplate(internal, params), own.locale);
    }
  }
  return null;
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
