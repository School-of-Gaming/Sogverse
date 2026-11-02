/**
 * The pages the advertising scripts are allowed to load on, as route templates.
 *
 * **An allowlist, and deliberately nothing else.** There is no list of
 * forbidden pages and no completeness check asserting that every route appears
 * in one list or the other, because the two directions of error are not
 * symmetric here: a page missing from this list gets no pixel, which costs a
 * measurement; a page wrongly on it hands an advertising platform the URL and
 * the referrer of a document that may carry a single-use token or a child's id
 * in its address bar. So the safe default *is* the answer, and a forcing check
 * would only add a way for a new page to be waved through by whoever is adding
 * it.
 *
 * What earns a place: a page a stranger can be sent to by an ad, whose whole
 * audience is people deciding whether to buy from us. Every URL on the list is
 * public, carries no token and identifies nobody — which is the property the
 * pixel's reporting of the page URL and the referrer depends on, not a
 * coincidence of what is on the list today.
 *
 * Templates, not paths: the visitor's pathname is normalised to its internal
 * template before it is looked up, so one entry covers every locale's slug and
 * every id a dynamic route can carry.
 */

import type { InternalPathname } from "@/i18n/pathnames";
import {
  AGE_PARAM,
  AUDIENCE_PARAM,
  DAYS_PARAM,
  FORMAT_PARAM,
  FROM_PARAM,
  LANGUAGE_PARAM,
  PRICE_PARAM,
  TAG_PARAM,
  TOPIC_PARAM,
} from "@/components/public/products/browse-state";
import { CATEGORY_PARAM } from "@/components/public/products/shop-categories";
import { resolveInternalPath } from "@/lib/navigation/internal-path";
import { normalizeExternalPath } from "@/lib/navigation/locale-path";

export const MARKETING_PAGES = [
  "/",
  "/about",
  "/roblox",
  "/roblox-online",
  "/roblox-all",
  "/shop",
  "/shop/[id]",
  "/discover/[idOrSlug]",
  "/register",
  "/login",
] as const satisfies readonly InternalPathname[];

/**
 * Whether a normalised route template is a marketing page. A path that matched
 * no template at all (`null`) is not one — an unknown URL is the last thing
 * that should be reported anywhere.
 */
export function isMarketingPage(
  template: InternalPathname | null,
): boolean {
  if (template === null) return false;
  return (MARKETING_PAGES as readonly string[]).includes(template);
}

/**
 * The query keys a marketing page may carry and still be reported.
 *
 * The allowlist above is matched against the pathname, but the pixels'
 * libraries report the whole URL, query string included — and the proxy puts a
 * private path into the query of two marketing pages: a signed-out parent
 * reaching a child's page is bounced to `/login?redirect=/parent/gamers/<id>`.
 * So a page view is reported only when every key in the query is one of these:
 * the campaign parameters an ad link carries, the click ids the platforms
 * append, and the shop's own filter state, which names topics, formats and
 * prices and nobody. `redirect` is the one key judged by its value instead —
 * see the function below. Anything else refuses the report, which costs a
 * measurement rather than a secret.
 */
const REPORTABLE_QUERY_KEYS: ReadonlySet<string> = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "rdt_cid",
  CATEGORY_PARAM,
  TOPIC_PARAM,
  FORMAT_PARAM,
  PRICE_PARAM,
  LANGUAGE_PARAM,
  AUDIENCE_PARAM,
  TAG_PARAM,
  AGE_PARAM,
  DAYS_PARAM,
  FROM_PARAM,
]);

const REDIRECT_PARAM = "redirect";

/**
 * Whether a page's query string (`location.search`) may travel to an ad
 * platform.
 *
 * **`redirect` travels only when its value is itself a reportable marketing
 * page** — the page a parent left to create an account or sign in, such as a
 * product page or a landing page's guide. The value is resolved through
 * `resolveInternalPath()`, must come back from it unchanged (see the helper
 * below), is matched on its locale-stripped internal template,
 * and its own query must pass the plain key allowlist: a `redirect` nested
 * inside a `redirect` refuses rather than recursing, and so does a fragment.
 * Every occurrence of a repeated key is checked. Anything else — a child's
 * page, an external or unparseable value, a path matching no route — refuses
 * exactly as an unknown key does.
 *
 * Pure: it needs no `window`, so it runs anywhere.
 */
export function isReportableQuery(search: string): boolean {
  for (const [key, value] of new URLSearchParams(search)) {
    if (REPORTABLE_QUERY_KEYS.has(key)) continue;
    if (key === REDIRECT_PARAM && isReportableRedirect(value)) continue;
    return false;
  }
  return true;
}

/** Whether every key in a query is on the plain allowlist — no `redirect`. */
function hasOnlyReportableKeys(params: URLSearchParams): boolean {
  for (const key of params.keys()) {
    if (!REPORTABLE_QUERY_KEYS.has(key)) return false;
  }
  return true;
}

/**
 * Any absolute base: the value has already been resolved to an internal path,
 * so this only splits it into its parts.
 */
const PARSE_BASE = "https://internal.invalid";

/**
 * The pixels report the raw value on the address bar, so the value matched has
 * to be that value, not a rewriting of it. Refused unless already canonical:
 * the URL parser hands it back unchanged (no dot segment, `%2e%2e` or
 * backslash for it to collapse), its path has no empty segment (`//`, a
 * trailing `/`) for the matcher to skip, and no `%` at all, which the matcher would decode — a
 * `%2F` hidden in one segment reads as one id. No path the app links to needs
 * one: route slugs, landing page slugs and product ids are all plain ASCII.
 */
function isReportableRedirect(value: string): boolean {
  // The empty fallback would equal an empty value, so that refuses first.
  if (value === "" || resolveInternalPath(value, "") !== value) return false;
  const target = new URL(value, PARSE_BASE);
  const { pathname } = target;
  if (pathname.includes("%")) return false;
  if (pathname !== "/" && pathname.slice(1).split("/").includes("")) {
    return false;
  }
  if (target.hash !== "") return false;
  if (!isMarketingPage(normalizeExternalPath(target.pathname).template)) {
    return false;
  }
  return hasOnlyReportableKeys(target.searchParams);
}

/**
 * Whether the address bar still shows `pathname` with a query that may travel
 * — the check every pixel makes at the moment of sending, because the URL a
 * pixel's library attaches to an event is the one the tab shows *then*, not
 * the one that authorised the report.
 *
 * Both sides are resolved through the URL parser, so a slug with a non-ASCII
 * character compares the same whether the router hands it over encoded or not.
 * Browser-only: it reads `window.location`.
 */
export function addressBarStillShows(pathname: string): boolean {
  const authorised = new URL(pathname, window.location.origin).pathname;
  if (window.location.pathname !== authorised) return false;
  return isReportableQuery(window.location.search);
}
