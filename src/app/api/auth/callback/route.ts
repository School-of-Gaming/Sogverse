import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ROLE_POST_LOGIN_PATHS } from "@/lib/constants/roles";
import { ROUTES } from "@/lib/constants";
import { isSupportedLocale } from "@/lib/constants/locales";
import { getOrigin } from "@/lib/url";
import type { OAuthLoginError } from "@/lib/google-sign-in";
import {
  COMPLETE_REGISTRATION_GEDU_QUERY,
  readCompleteRegistrationTarget,
  resolveSafeRedirect,
} from "@/lib/navigation/post-auth-redirect";
import {
  LOCALE_COOKIE_NAME,
  localeCookieOptions,
} from "@/lib/locale-cookie";

/**
 * The one way into a Google sign-in: Google sends the browser back here with
 * a code (or an error), and this route exchanges it for a session and decides
 * where the account goes next.
 *
 * Every destination is a bare path on `getOrigin(request)` — the proxy puts
 * the locale on it by the cookie ladder, which is why a successful sign-in
 * seeds that cookie below.
 */
export async function GET(request: Request) {
  const origin = getOrigin(request);
  const { searchParams } = new URL(request.url);

  const toLogin = (error: OAuthLoginError) =>
    NextResponse.redirect(`${origin}${ROUTES.login}?error=${error}`);

  // Google (or GoTrue on its behalf) answers with `?error=` instead of a code
  // when the exchange never started. `access_denied` is the person pressing
  // Cancel on Google's consent screen, which is a choice rather than a fault
  // and is told apart on the login page.
  const providerError = searchParams.get("error");
  if (providerError) {
    return toLogin(
      providerError === "access_denied"
        ? "oauth_cancelled"
        : "auth_callback_error",
    );
  }

  const code = searchParams.get("code");
  if (!code) return toLogin("auth_callback_error");

  // `next` is caller-supplied: it goes through the same allowlist as the login
  // form's `?redirect=`, widened only by the finish page the register pages'
  // Google buttons send. Anything else is dropped and the role decides.
  const next = resolveSafeRedirect(searchParams.get("next"), {
    allowCompleteRegistration: true,
  });
  const finishTarget = next ? readCompleteRegistrationTarget(next) : null;

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return toLogin("auth_callback_error");

  // Read the just-exchanged session's claims to determine the role.
  // getClaims() verifies the freshly-minted token locally (no GoTrue
  // round-trip) — see docs/architecture/performance.md.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) return toLogin("auth_callback_error");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, locale, registration_completed_at")
    .eq("id", userId)
    .single();

  const role = profile?.role;

  // **A gamer never signs in with Google.** A child's account is reached by
  // username or through the parent's account; a Google identity that lands on
  // one (an address shared with a real mailbox a gamer holds) is refused, and
  // the session the exchange just minted is revoked before anything can use
  // it. Signing out here clears the cookies on this very response. `local`
  // scope, because the default revokes every session the account holds — and
  // the gamer's own sign-ins on other devices did nothing wrong.
  if (role === "gamer") {
    await supabase.auth.signOut({ scope: "local" });
    return toLogin("google_gamer");
  }

  let redirectPath: string;
  if (role === "customer" && profile?.registration_completed_at == null) {
    // **An account that still owes its registration goes to the finish page,
    // whatever `next` said.** Google hands over no name, terms or consents, so
    // nothing else is useful until they are given. The page keeps the locale
    // the register page was read in when `next` carried one, and the Gedu
    // variant only when the Gedu register page asked for it.
    const pathname = finishTarget?.pathname ?? ROUTES.completeRegistration;
    redirectPath = finishTarget?.asGedu
      ? `${pathname}?${new URLSearchParams(COMPLETE_REGISTRATION_GEDU_QUERY)}`
      : pathname;
  } else if (next && !finishTarget) {
    redirectPath = next;
  } else {
    // No usable `next` — including a finish page sent for an account that has
    // already finished (an existing account pressing a register page's Google
    // button). Customers land on /select-profile (the family selector); other
    // roles go straight to their dashboard. See ROLE_POST_LOGIN_PATHS.
    redirectPath = role
      ? ROLE_POST_LOGIN_PATHS[role]
      : ROLE_POST_LOGIN_PATHS.customer;
  }

  const response = NextResponse.redirect(`${origin}${redirectPath}`);

  // **Signing in seeds the locale cookie from the profile.** The redirect
  // above usually goes to a bare path, which the proxy resolves by the
  // cookie → `Accept-Language` → English ladder — so without this a Finnish
  // reader signing in on a fresh device would land on `/en/parent`. `locale`
  // rides on the profile read that was already happening; a null value means
  // "auto-detect from the browser" and is deliberately left unwritten, since
  // the header leg is what that reader asked for.
  if (isSupportedLocale(profile?.locale)) {
    response.cookies.set(
      LOCALE_COOKIE_NAME,
      profile.locale,
      localeCookieOptions(),
    );
  }

  return response;
}
