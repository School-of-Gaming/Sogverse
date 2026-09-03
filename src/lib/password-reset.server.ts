import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import {
  detectLocaleFromHeader,
  isSupportedLocale,
} from "@/lib/constants/locales";
import { buildPasswordResetEmail } from "@/lib/email-templates/password-reset";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { isSyntheticGamerEmail } from "@/lib/gamer-sign-in";
import { getOrigin } from "@/lib/url";

/**
 * Mail somebody a link to set a new password.
 *
 * Extracted from the forgot-password route because a second caller now needs the
 * identical mail: a child in sign-in mode `email` has no password at all until
 * they have verified their address, and the moment they do, the verify page
 * sends them this. Two ways of arriving, one mail, one link shape.
 *
 * **It refuses a synthetic address, silently.** A child in `username` mode has
 * an address nobody reads, so a reset link sent there reaches nobody — and their
 * password is not theirs to reset in the first place: the parent sets it from
 * the child's card. Refusing is therefore the correct behaviour rather than a
 * limitation, and it is silent because the one route that calls this from
 * outside answers 200 to everything (see below).
 *
 * **Every other failure is swallowed too, and the caller is told nothing.** The
 * forgot-password route's whole shape is that it cannot report what it found —
 * an error would be an enumeration signal, telling a prober that an address
 * exists. Callers that legitimately know the account exists (the verify page,
 * acting on a token it just validated) get the same silence, which costs them
 * nothing: the page's message is about the verification, not about the mail.
 */
export async function sendPasswordResetEmail(args: {
  email: string;
  /**
   * The incoming request's headers. Both things this needs from the request —
   * the trusted origin and the language hint — are headers, and one of the two
   * callers is a server *component*, which has `headers()` and no Request at
   * all. Taking the narrower thing is what lets both hand over the same value.
   */
  requestHeaders: Headers;
}): Promise<void> {
  const { email, requestHeaders } = args;

  if (isSyntheticGamerEmail(email)) {
    // Not an error and not a bug: a username-mode child's password is reset by
    // their parent, and there is no mailbox behind this address to reset it in.
    return;
  }

  // Trusted origin, never the raw Host/request URL — the reset link goes into
  // an email and carries a recovery token, so a spoofed Host would turn it
  // into an account-takeover phishing link.
  const origin = getOrigin(requestHeaders);
  const adminClient = createAdminClient();

  // Fetch locale preference and generate the reset link in parallel.
  const [profileResult, linkResult] = await Promise.all([
    adminClient.from("profiles").select("locale").eq("email", email).single(),
    // We only consume the single-use token_hash from the result (see the
    // emailed-link construction below) — not the action_link — so no
    // redirectTo is needed.
    adminClient.auth.admin.generateLink({ type: "recovery", email }),
  ]);

  if (linkResult.error) {
    // Don't leak whether the email exists — log and stop.
    console.error("generateLink error:", linkResult.error.message);
    return;
  }

  // Resolve locale: profile preference → Accept-Language header → English.
  const pref = profileResult.data?.locale;
  const locale = isSupportedLocale(pref)
    ? pref
    : detectLocaleFromHeader(requestHeaders.get("Accept-Language"));

  const t = await getEmailTranslator(locale);

  // Email a link to OUR reset page carrying the single-use token_hash — NOT
  // Supabase's action_link. The action_link is a bare GET on /auth/v1/verify
  // that consumes the token on *access*, so corporate email security scanners
  // that pre-fetch links burn it before the real user clicks. Our page
  // consumes the token only on submit — a POST a passive scanner never makes.
  //
  // The token_hash rides in the query string. That's safe because our global
  // `Referrer-Policy: strict-origin-when-cross-origin` strips the query from
  // any cross-origin Referer, so it never leaves our domain — the assumption
  // behind Supabase's documented token_hash pattern.
  //
  // `email` is the username hint for the reset page's hidden
  // autocomplete="username" field, so password managers save the new password
  // against the right account. Not a credential — the page uses it only as a
  // hint, the token authorizes the reset. It's the recipient's own email: no
  // enumeration exposure, same low-sensitivity URL channel as the token.
  const resetUrl = `${origin}${ROUTES.resetPassword}?token_hash=${encodeURIComponent(
    linkResult.data.properties.hashed_token,
  )}&type=recovery&email=${encodeURIComponent(email)}`;

  await sendTransactionalEmail({
    fromEmail: SENDER_EMAIL,
    fromName: SENDER_NAME,
    toEmail: email,
    subject: t("passwordReset.subject"),
    htmlContent: buildPasswordResetEmail(t, resetUrl, locale),
    // Someone who replies to this is locked out and asking for help, so the
    // reply goes to the monitored support inbox rather than the unattended
    // sending address. Note that a reply quotes this mail, recovery token and
    // all — that inbox is therefore credential-bearing and shared, which is the
    // trade accepted to keep a stuck user reachable.
    replyToEmail: SUPPORT_EMAIL,
  });
}
