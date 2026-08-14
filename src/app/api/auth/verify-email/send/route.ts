import { defineRoute } from "@/lib/api/define-route";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import { createEmailVerificationToken } from "@/lib/email-verification";
import { buildVerifyEmailEmail } from "@/lib/email-templates/verify-email";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import {
  detectLocaleFromHeader,
  isSupportedLocale,
} from "@/lib/constants/locales";
import { getOrigin } from "@/lib/url";

/**
 * POST /api/auth/verify-email/send
 *
 * Mint a verification link for the caller's OWN address and mail it there. No
 * body: the route takes its target from the session and can name no other, which
 * is most of what makes it safe to expose — the worst a caller can do with it is
 * send themselves mail.
 *
 * **Gamers are excluded from the role list.** A gamer's address is the synthetic
 * `<token>@gamer.sogverse.internal` one the account was created with; nobody
 * reads that inbox, so a send would be a message into a void and a "verified"
 * stamp on it would mean nothing.
 *
 * **An already-verified caller is re-sent the link rather than refused.** The
 * settings button that calls this is only offered while the address is
 * unverified, so reaching this route already-verified means the state changed
 * under a stale page — and the honest answer to "send me the link" is to send
 * it. The link is idempotent (`email-verification.ts`), so the mail it delivers
 * confirms what is already true instead of doing anything a second time; a
 * special-cased no-op would only teach the client to distinguish two outcomes
 * that are the same outcome.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: ["customer", "gedu", "admin"],

  handler: async ({ request, profile }) => {
    // No address on file → nothing to verify and nowhere to send. Answering
    // success keeps the client's one path; there is no state to report.
    if (!profile.email) return { success: true };

    // The TRUSTED origin, never the raw Host header. This link goes in an email
    // and carries a signed token, so a spoofed `Host: evil.com` would turn it
    // into a phishing URL the recipient has every reason to trust.
    const origin = getOrigin(request);
    const token = await createEmailVerificationToken(profile.id, profile.email);
    const verificationUrl = `${origin}${ROUTES.verifyEmail}?token=${encodeURIComponent(token)}`;

    const pref = profile.locale;
    const locale = isSupportedLocale(pref)
      ? pref
      : detectLocaleFromHeader(request.headers.get("Accept-Language"));
    const t = await getEmailTranslator(locale);

    await sendTransactionalEmail({
      fromEmail: SENDER_EMAIL,
      fromName: SENDER_NAME,
      toEmail: profile.email,
      subject: t("verifyEmail.subject"),
      htmlContent: buildVerifyEmailEmail(t, locale, {
        firstName: profile.first_name,
        verificationUrl,
      }),
      // Product mail to a person: someone replying to this is asking us
      // something, so the reply goes to the monitored support inbox rather than
      // the unattended sending address.
      replyToEmail: SUPPORT_EMAIL,
    });

    return { success: true };
  },
});
