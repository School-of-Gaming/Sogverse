/**
 * The Open Graph cards, and the one place their URLs, dimensions and cache
 * posture are written down.
 *
 * **Both cards are root-level route handlers, outside `[locale]`, taking the
 * locale as a query parameter.** Next's `opengraph-image` file convention could
 * not survive locale-prefixed routing: a file under `[locale]` emits
 * `/en/opengraph-image` into the meta tag (a crawler chasing a redirecting OG
 * URL is the failure this routing work exists to fix), a file at the app root
 * has no locale to render at, and file-convention metadata outranks config
 * metadata so the emitted URL cannot be overridden while the file exists. A
 * plain route handler has none of those properties: it is reached by a bare URL
 * that the proxy's matcher already excludes — which keeps the "publicly
 * cacheable responses never pass through the proxy" invariant intact — and its
 * locale is a parameter the page puts there.
 *
 * The path sits under `opengraph-images/` (plural) rather than reusing the
 * reserved `opengraph-image` segment: the matcher's exclusion is a prefix, so
 * this is covered by it with no proxy edit, and nothing here has to rely on
 * Next tolerating a directory named after one of its own file conventions.
 *
 * Pages emit these URLs explicitly from their own `generateMetadata` — the
 * `[locale]` layout for the site-wide card, `/roblox` and its three sub-pages
 * for the programme card.
 */

import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";

/** The canonical Open Graph size, and what both cards are drawn at. */
export const OG_CARD_SIZE = { width: 1200, height: 630 } as const;

/** Every card the app serves, keyed by name, with the path that serves it. */
export const OG_CARD_PATHS = {
  site: "/opengraph-images/site",
  roblox: "/opengraph-images/roblox",
} as const;

export type OgCard = keyof typeof OG_CARD_PATHS;

/**
 * The URL a page points its `og:image` at. Relative, so it resolves against the
 * `metadataBase` the root layout sets rather than restating an origin that
 * differs between production and every preview deployment.
 */
export function ogCardUrl(card: OgCard, locale: SupportedLocale): string {
  return `${OG_CARD_PATHS[card]}?locale=${locale}`;
}

/**
 * The locale a card request asks to be drawn in — **validated, never trusted**.
 * Anything absent, malformed or simply not a locale we ship falls back to the
 * default rather than erroring: this URL is fetched by scrapers we do not
 * control, and an English card is a better answer to a mangled parameter than a
 * broken image.
 */
export function cardLocaleOf(request: Request): SupportedLocale {
  const value = new URL(request.url).searchParams.get("locale");
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * The card's own caching, which the file convention used to provide for free.
 * An `ImageResponse` is expensive (satori lays the card out and resvg rasterises
 * it) and its content changes only when we deploy new copy, so a crawler must
 * never be the thing that renders one twice.
 *
 * A year, immutable: the content of a given URL is fixed for a release. The
 * consequence to know about is that a copy edit does not reach a client that
 * has already cached the old bytes — a deploy purges the CDN, and the crawlers
 * that matter re-fetch, so what survives is a browser cache nobody is looking
 * at.
 */
export const OG_CARD_CACHE_CONTROL = "public, max-age=31536000, immutable";
