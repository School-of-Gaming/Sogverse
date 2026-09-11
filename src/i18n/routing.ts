import { defineRouting } from "next-intl/routing";

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/lib/constants/locales";
import { PATHNAMES } from "./pathnames";

/**
 * The locale-in-URL routing contract, shared by the proxy's rewrite, the
 * wrapped navigation APIs and the request config.
 *
 * - **`localePrefix: "always"`** — every page URL carries its locale, English
 *   included. A bare path is never a page: it is the detector, and the proxy
 *   redirects it (cookie → `Accept-Language` → English). One URL shape means no
 *   "bare means English" special case anywhere, and `/en/…` is a URL that pins
 *   English for any recipient or crawler.
 * - **`localeDetection: false` and `localeCookie: false`** — locale resolution
 *   stays ours. Detection lives in the proxy's bare-path ladder so it is the
 *   same ladder the rest of the app has always used, and next-intl's own
 *   `NEXT_LOCALE` cookie is off because visiting a prefixed URL must never
 *   persist that locale: following a link is reading, touching the picker is
 *   choosing.
 * - **`alternateLinks: false`** — `hreflang` is emitted by page metadata, which
 *   is the only layer that can compute a self-referencing canonical.
 *
 * `locales` derives from `SUPPORTED_LOCALES`, so that list stays the single
 * source of truth and a locale added there fails the build in `PATHNAMES`
 * rather than 404ing.
 */
export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
  localeDetection: false,
  localeCookie: false,
  alternateLinks: false,
  pathnames: PATHNAMES,
});
