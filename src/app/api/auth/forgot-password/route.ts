import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { getOrigin } from "@/lib/url";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import { buildPasswordResetEmail } from "@/lib/email-templates/password-reset";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import {
  detectLocaleFromHeader,
  isSupportedLocale,
} from "@/lib/constants/locales";

const requestSchema = z.object({
  email: z.string().email(),
});

/**
 * POST /api/auth/forgot-password
 *
 * Always answers 200, whatever happens. That is the enumeration defence, and it
 * is why the body is parsed inside the handler rather than through the
 * primitive's body slot: the slot answers 400 on a schema failure, which would
 * tell a prober that a well-formed address had been accepted and a malformed
 * one had not. Every failure path below returns the same success body.
 */
export const POST = defineRoute({
  posture: "public",
  reason:
    "a password reset is requested by someone who cannot sign in. Always answers 200 regardless of whether the address exists, which is the enumeration defence",

  handler: async ({ request }) => {
    const success = { success: true };
    try {
      await sendResetLink(request);
    } catch (error) {
      // Still 200, for the same reason every named failure path below is: a
      // 500 from the wrapper's catch would itself be an enumeration signal.
      console.error(
        "Forgot password error:",
        error instanceof Error ? error.message : error,
      );
    }
    return success;
  },
});

/** Everything that can fail. The caller swallows the outcome on purpose. */
async function sendResetLink(request: Request): Promise<void> {
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return;

  // Trusted origin, never the raw Host/request URL — the reset link goes into
  // an email and carries a recovery token, so a spoofed Host would turn it
  // into an account-takeover phishing link.
  const origin = getOrigin(request);
  const adminClient = createAdminClient();

  // Fetch locale preference and generate the reset link in parallel.
  const [profileResult, linkResult] = await Promise.all([
    adminClient
      .from("profiles")
      .select("locale")
      .eq("email", parsed.data.email)
      .single(),
    // We only consume the single-use token_hash from the result (see the
    // emailed-link construction below) — not the action_link — so no
    // redirectTo is needed.
    adminClient.auth.admin.generateLink({
      type: "recovery",
      email: parsed.data.email,
    }),
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
    : detectLocaleFromHeader(request.headers.get("Accept-Language"));

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
  )}&type=recovery&email=${encodeURIComponent(parsed.data.email)}`;

  await sendTransactionalEmail({
    fromEmail: SENDER_EMAIL,
    fromName: t("senderAuth"),
    toEmail: parsed.data.email,
    subject: t("passwordReset.subject"),
    htmlContent: buildPasswordResetEmail(t, resetUrl, locale),
  });
}
