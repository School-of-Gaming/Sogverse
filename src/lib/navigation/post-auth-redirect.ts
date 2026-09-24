import { ROUTES } from "@/lib/constants";
import { resolveInternalPath } from "@/lib/navigation/internal-path";
import { toInternalPathname } from "@/lib/navigation/locale-path";
import {
  readUtmFromSearchParams,
  utmQueryParams,
  type UtmAttribution,
} from "@/lib/utm";

/**
 * Where a sign-in may land when the caller named the destination: the one
 * allowlist behind the login form's `?redirect=` and the OAuth callback's
 * `?next=`, so the two cannot drift apart.
 */

// `resolveInternalPath` hands back a path with its query and hash still on it,
// and only the pathname is a route. Any absolute base works to split them; the
// value has already been proved same-origin by the time it gets here.
const SENTINEL = "https://internal.invalid";

// Allowlisted prefixes for post-auth redirects. Anything else is dropped
// and the user lands on the fallback (their dashboard). Public product detail
// pages — which expose the "Sign in to enroll" CTA — live at `/shop/[id]` and
// at `/schools/[municipalityName]/[id]` (the municipality-club variant; both
// render the same ProductDetailPage), so both prefixes are allowlisted and
// sign-in returns the user to the product they came from. A trailing slash is
// required on each so the bare `/shop` / `/schools` root isn't itself a valid
// target and so `/shopxyz`-style prefix confusion can't sneak through.
// `/shop/` resolves to exactly the product pages; `/schools/` also admits the
// per-municipality listing (`/schools/[municipalityName]`) since it shares the
// segment — that's a harmless internal landing spot, and the destination is
// guaranteed internal by `resolveInternalPath` regardless.
const SAFE_REDIRECT_PREFIXES: readonly string[] = [
  `${ROUTES.shop}/`, // /shop/[id]
  `${ROUTES.schools}/`, // /schools/[municipalityName]/[id]
];

interface SafeRedirectOptions {
  /**
   * Also admit the finish page an account created through Google completes
   * its registration on. Only the OAuth callback passes this: the register
   * pages' Google buttons send it as their `next`, while a password sign-in
   * has no reason to land there.
   */
  allowCompleteRegistration?: boolean;
}

/**
 * Returns `redirect` if it points to a known safe destination, else `null`.
 *
 * Two-stage check: first normalize the candidate through `resolveInternalPath`
 * (WHATWG URL parser — collapses `..`, rejects every off-origin variant), then
 * apply the allowlist to the *normalized* path. Normalizing first is
 * load-bearing: a raw `startsWith("/shop/")` passes `/shop/../admin`, which
 * the browser then navigates to `/admin` — the prefix check and the real
 * destination would disagree. Checking the post-normalization path closes that
 * gap while keeping the narrow intent.
 */
export function resolveSafeRedirect(
  redirect: string | null,
  { allowCompleteRegistration = false }: SafeRedirectOptions = {},
): string | null {
  const path = resolveInternalPath(redirect, "");
  if (!path) return null;
  // **Matched on the internal pathname, navigated to raw.** The value arrives
  // as the external URL the reader was actually on (`/fi/kauppa/<id>`), which
  // no bare `/shop/` prefix would ever match — so the allowlist would silently
  // drop it and strand a buyer on their dashboard. The normalizer strips the
  // locale prefix and untranslates the slug for the *check*; what is returned
  // is the original path, so the reader returns to the page they left, in the
  // language they were reading it in.
  const internal = toInternalPathname(new URL(path, SENTINEL).pathname);
  if (allowCompleteRegistration && internal === ROUTES.completeRegistration) {
    return path;
  }
  return SAFE_REDIRECT_PREFIXES.some((p) => internal.startsWith(p))
    ? path
    : null;
}

/**
 * The query that asks the finish page for its Gedu variant — sent by the Gedu
 * register page, and the only query the callback carries onto the finish page.
 */
export const COMPLETE_REGISTRATION_GEDU_QUERY = { as: "gedu" } as const;

/** The finish page's parts, as the callback rebuilds its address from them. */
export interface CompleteRegistrationTarget {
  pathname: string;
  asGedu: boolean;
  /**
   * The landing link's attribution, carried across the Google round trip,
   * which unloads the tab that held it in memory. Sanitised on the way in.
   */
  utm: UtmAttribution;
}

/**
 * The finish page a safe `next` names, split into the raw (locale-prefixed)
 * pathname, whether it asked for the Gedu variant and the attribution it
 * carried — or `null` when `next` is some other page. The callback rebuilds
 * the destination from these parts rather than forwarding the query, so
 * nothing else a caller appended survives the trip.
 */
export function readCompleteRegistrationTarget(
  safePath: string,
): CompleteRegistrationTarget | null {
  const url = new URL(safePath, SENTINEL);
  if (toInternalPathname(url.pathname) !== ROUTES.completeRegistration) {
    return null;
  }
  return {
    pathname: url.pathname,
    asGedu:
      url.searchParams.get("as") === COMPLETE_REGISTRATION_GEDU_QUERY.as,
    utm: readUtmFromSearchParams(url.searchParams),
  };
}

/**
 * The finish page's query: the Gedu variant when asked for, then the
 * attribution — the whole of what its address may carry. Shared by the
 * register pages that build `next` and the callback that rebuilds it.
 */
export function completeRegistrationQuery({
  asGedu,
  utm,
}: {
  asGedu: boolean;
  utm: UtmAttribution;
}): Record<string, string> {
  return {
    ...(asGedu ? COMPLETE_REGISTRATION_GEDU_QUERY : {}),
    ...utmQueryParams(utm),
  };
}
