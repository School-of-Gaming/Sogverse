/**
 * The pages the Meta Pixel is allowed to load on, as route templates.
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

export const MARKETING_PAGES = [
  "/",
  "/about",
  "/roblox",
  "/shop",
  "/shop/[id]",
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
