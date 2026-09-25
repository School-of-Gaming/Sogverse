import { ROUTES } from "@/lib/constants";
import { resolveInternalPath } from "@/lib/navigation/internal-path";
import { toInternalPathname } from "@/lib/navigation/locale-path";
import {
  hasUtmAttribution,
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
 * register page, and carried by the callback and by the proxy's bounce off
 * `/register-gedu`.
 */
export const COMPLETE_REGISTRATION_GEDU_QUERY = { as: "gedu" } as const;

/**
 * The query that asks for the parent variant outright. Only the finish page's
 * own switch link sends it: an address without `as` means "whatever this
 * account set out to register as", which the intent cookie may say is a Gedu.
 */
export const COMPLETE_REGISTRATION_PARENT_QUERY = { as: "parent" } as const;

/** The finish page's param naming the product page to land on afterwards. */
const REDIRECT_PARAM = "redirect";

/** What the finish page's address carries, each part already sanitised. */
export interface CompleteRegistrationIntent {
  /**
   * The variant asked for: `true` for the Gedu form, `false` for the parent
   * form asked for outright, `null` when the address does not say.
   */
  asGedu: boolean | null;
  /**
   * The landing link's attribution, carried across the Google round trip,
   * which unloads the tab that held it in memory. Sanitised on the way in.
   */
  utm: UtmAttribution;
  /**
   * The product page the account set out from, to land on once registered —
   * only ever a value `resolveSafeRedirect` admitted.
   */
  redirect: string | null;
}

/** The finish page's parts, as the callback rebuilds its address from them. */
export interface CompleteRegistrationTarget extends CompleteRegistrationIntent {
  pathname: string;
}

/**
 * The finish page's intent as a query carries it: the variant, the
 * attribution through its sanitiser and the redirect through the post-auth
 * allowlist. Anything else in the query is ignored.
 */
export function readCompleteRegistrationIntent(
  params: URLSearchParams,
): CompleteRegistrationIntent {
  const as = params.get("as");
  return {
    asGedu:
      as === COMPLETE_REGISTRATION_GEDU_QUERY.as
        ? true
        : as === COMPLETE_REGISTRATION_PARENT_QUERY.as
          ? false
          : null,
    utm: readUtmFromSearchParams(params),
    redirect: resolveSafeRedirect(params.get(REDIRECT_PARAM)),
  };
}

/**
 * The finish page a safe `next` names, split into the raw (locale-prefixed)
 * pathname and the intent it carried — or `null` when `next` is some other
 * page. The callback rebuilds the destination from these parts rather than
 * forwarding the query, so nothing else a caller appended survives the trip.
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
    ...readCompleteRegistrationIntent(url.searchParams),
  };
}

/**
 * What the finish page shows: its own address first and, for each part the
 * address lacks, the intent cookie the callback set — so a bounce that drops
 * the query still shows a would-be Gedu the Gedu form, and keeps the product
 * page and the attribution. The attribution falls back whole, never field by
 * field, so one landing link's values are never mixed with another's. The
 * cookie is read through the same sanitisers as the address.
 */
export function resolveCompleteRegistrationIntent(
  address: URLSearchParams,
  cookieValue: string | null | undefined,
): { asGedu: boolean; utm: UtmAttribution; redirect: string | null } {
  const fromAddress = readCompleteRegistrationIntent(address);
  const fromCookie = readCompleteRegistrationIntent(
    new URLSearchParams(cookieValue ?? ""),
  );
  return {
    asGedu: fromAddress.asGedu ?? fromCookie.asGedu ?? false,
    utm: hasUtmAttribution(fromAddress.utm) ? fromAddress.utm : fromCookie.utm,
    redirect: fromAddress.redirect ?? fromCookie.redirect,
  };
}

/**
 * The finish page's query: the Gedu variant when asked for, then the
 * attribution, then the product page to return to — the whole of what its
 * address may carry. Shared by the register pages that build `next`, the
 * callback that rebuilds it and the finish page's switch link. The redirect
 * passes the post-auth allowlist here too, so no caller can emit a raw path.
 */
export function completeRegistrationQuery({
  asGedu,
  utm,
  redirect = null,
}: {
  asGedu: boolean;
  utm: UtmAttribution;
  redirect?: string | null;
}): Record<string, string> {
  const safeRedirect = resolveSafeRedirect(redirect);
  return {
    ...(asGedu ? COMPLETE_REGISTRATION_GEDU_QUERY : {}),
    ...utmQueryParams(utm),
    ...(safeRedirect ? { [REDIRECT_PARAM]: safeRedirect } : {}),
  };
}
