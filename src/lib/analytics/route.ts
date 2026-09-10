/**
 * The `route` dimension Vercel Web Analytics records beside `request_path`.
 *
 * **Translated slugs split that dimension unless the app supplies it.** The
 * analytics package computes `route` in the browser by substituting the values
 * of the current route's params back out of the pathname — it knows the locale
 * *value* but not the slug *translation*, so `/fi/kauppa` would come back as
 * `/[locale]/kauppa` and every translated page would own one row per language
 * forever. "How many people landed on the shop" would be a sum across four rows.
 *
 * So the route is derived here instead, from the same pathnames map the proxy
 * normalizes against: the **internal template**, with the locale segment
 * dropped. Every locale of a page lands on one row (`/shop`, `/shop/[id]`), and
 * the `route` filters in the analytics runbook keep working unchanged. `path`
 * stays the raw browser pathname, so the per-language split is still readable
 * from `request_path`.
 *
 * A path matching no template keeps its locale-stripped form, which is the
 * honest answer for a 404: it groups every locale's miss on one row without
 * inventing a route that does not exist.
 */

import { normalizeExternalPath } from "@/lib/navigation/locale-path";

export function analyticsRouteFor(pathname: string): string {
  const { pathname: internal, template } = normalizeExternalPath(pathname);
  return template ?? internal;
}
