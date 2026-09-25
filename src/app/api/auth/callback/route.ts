import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasGoogleVerifiedAddress } from "@/services/users/registration-completion.server";
import { ROLE_POST_LOGIN_PATHS } from "@/lib/constants/roles";
import { ROUTES } from "@/lib/constants";
import { isSupportedLocale } from "@/lib/constants/locales";
import { getOrigin } from "@/lib/url";
import { NO_UTM_ATTRIBUTION } from "@/lib/utm";
import type { OAuthLoginError } from "@/lib/google-sign-in";
import {
  completeRegistrationQuery,
  readCompleteRegistrationTarget,
  resolveSafeRedirect,
} from "@/lib/navigation/post-auth-redirect";
import {
  LOCALE_COOKIE_NAME,
  localeCookieOptions,
} from "@/lib/locale-cookie";
import {
  REGISTRATION_INTENT_COOKIE_NAME,
  registrationIntentCookieOptions,
} from "@/lib/registration-intent-cookie";

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
  const { data: exchanged, error } =
    await supabase.auth.exchangeCodeForSession(code);
  if (error) return toLogin("auth_callback_error");

  // Read the just-exchanged session's claims to determine the role.
  // getClaims() verifies the freshly-minted token locally (no GoTrue
  // round-trip) — see docs/architecture/performance.md.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) return toLogin("auth_callback_error");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, locale, registration_completed_at, email, email_verified_at")
    .eq("id", userId)
    .single();

  // **No profile, no sign-in.** Every routing decision below — the gamer
  // refusal, the owed registration — is read off this row, so a session whose
  // row could not be read has not been checked for either, and is revoked
  // rather than guessed at. `local` scope, for the gamer case's reason.
  if (profileError) {
    await supabase.auth.signOut({ scope: "local" });
    return toLogin("auth_callback_error");
  }

  const role = profile.role;

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

  // **A Google sign-in into an account whose address was never proven takes
  // the account over for the prover.** Confirmations are off, so anyone can
  // register a password account under an address that is not theirs, and
  // Google then links the real owner's identity to that account. Google has
  // just proven the address belongs to this person, so every other session —
  // including a squatter's — is revoked, as a completed password reset
  // revokes them, and the address is recorded verified. `others` scope keeps
  // this session.
  if (
    profile.email_verified_at === null &&
    hasGoogleVerifiedAddress(exchanged.user.identities, profile.email)
  ) {
    await claimAddressProvenByGoogle(supabase, userId);
  }

  let redirectPath: string;
  // The finish page's query, when this sign-in is sent there — kept in the
  // intent cookie below as well as on the address.
  let registrationIntent: string | null = null;
  if (role === "customer" && profile.registration_completed_at === null) {
    // **An account that still owes its registration goes to the finish page,
    // whatever `next` said.** Google hands over no name, terms or consents, so
    // nothing else is useful until they are given. The page keeps the locale
    // the register page was read in when `next` carried one, the Gedu variant
    // only when the Gedu register page asked for it, the landing link's
    // attribution, which the round trip through Google would otherwise lose,
    // and the product page the account set out from: the finish page's own
    // `redirect` when `next` was the finish page, or `next` itself when it was
    // a product page (the login page's Google button sends its `?redirect=`).
    const pathname = finishTarget?.pathname ?? ROUTES.completeRegistration;
    registrationIntent = new URLSearchParams(
      completeRegistrationQuery({
        asGedu: finishTarget?.asGedu ?? false,
        utm: finishTarget?.utm ?? NO_UTM_ATTRIBUTION,
        redirect: finishTarget ? finishTarget.redirect : next,
      }),
    ).toString();
    redirectPath = registrationIntent
      ? `${pathname}?${registrationIntent}`
      : pathname;
  } else if (next && !finishTarget) {
    redirectPath = next;
  } else {
    // No usable `next` — including a finish page sent for an account that has
    // already finished (an existing account pressing a register page's Google
    // button). Customers land on /select-profile (the family selector); other
    // roles go straight to their dashboard. See ROLE_POST_LOGIN_PATHS.
    redirectPath = ROLE_POST_LOGIN_PATHS[role];
  }

  const response = NextResponse.redirect(`${origin}${redirectPath}`);

  // **Signing in seeds the locale cookie from the profile.** The redirect
  // above usually goes to a bare path, which the proxy resolves by the
  // cookie → `Accept-Language` → English ladder — so without this a Finnish
  // reader signing in on a fresh device would land on `/en/parent`. `locale`
  // rides on the profile read that was already happening; a null value means
  // "auto-detect from the browser" and is deliberately left unwritten, since
  // the header leg is what that reader asked for.
  if (isSupportedLocale(profile.locale)) {
    response.cookies.set(
      LOCALE_COOKIE_NAME,
      profile.locale,
      localeCookieOptions(),
    );
  }

  // **The intent outlives the address.** The proxy's registration gate
  // bounces an owing account to a bare finish page, so the page falls back to
  // this cookie for whatever its address lacks. An intent with nothing in it
  // expires any earlier one rather than leaving it to speak for this sign-in.
  if (registrationIntent !== null) {
    const options = registrationIntentCookieOptions();
    response.cookies.set(
      REGISTRATION_INTENT_COOKIE_NAME,
      registrationIntent,
      registrationIntent ? options : { ...options, maxAge: 0 },
    );
  }

  return response;
}

/**
 * The two writes a Google-proven address earns an unverified account: every
 * other session revoked, and the verification stamp.
 *
 * **Neither failure blocks the sign-in**, only logs: the person signing in has
 * proven the address either way, so refusing them would lock the owner out of
 * their own account while leaving a squatter's session exactly where it was.
 * A failed revoke is retried by the next Google sign-in, since the stamp that
 * would skip it is written after it and only on its success.
 */
async function claimAddressProvenByGoogle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<void> {
  // The session's own client, not the Admin API: GoTrue identifies whose
  // other sessions to end from the access token itself, and the Admin API's
  // sign-out takes the same token.
  const { error: revokeError } = await supabase.auth.signOut({ scope: "others" });
  if (revokeError) {
    console.error(
      `[auth/callback] could not revoke other sessions for ${userId}`,
      revokeError,
    );
    return;
  }

  // email_verified_at has no authenticated UPDATE grant: service role only.
  const { error: stampError } = await createAdminClient()
    .from("profiles")
    .update({ email_verified_at: new Date().toISOString() })
    .eq("id", userId);
  if (stampError) {
    console.error(
      `[auth/callback] could not record the Google-verified address for ${userId}`,
      stampError,
    );
  }
}
