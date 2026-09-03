import { NextResponse } from "next/server";
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
import { hasRealEmail } from "@/lib/gamer-sign-in";

/**
 * POST /api/auth/verify-email/send
 *
 * Mint a verification link for the caller's OWN address and mail it there. No
 * body: the route takes its target from the session and can name no other, which
 * is most of what makes it safe to expose — the worst a caller can do with it is
 * send themselves mail.
 *
 * **Who may call it is a question about the ADDRESS, not the role.** Every
 * adult holds a real mailbox; a gamer holds one only in sign-in mode `email`.
 * The other two modes put a synthetic `@gamer.sogverse.internal` handle on the
 * account that nobody reads, so a send there would be a message into a void and
 * a "verified" stamp on it would mean nothing. So the gate lets every role
 * through and the handler refuses on `hasRealEmail`, which is the same question
 * the role list used to approximate — and approximated wrongly the moment a
 * child could hold an address of their own.
 *
 * A child in `email` mode reaching this route is the rarer path: the parent's
 * resend button (`/api/gamers/[id]/verification/send`) is the usual one,
 * because a child who has not verified yet cannot sign in to press this one.
 * It is here for the child who verified, set a password, and later changed
 * something — the same self-service every other role has.
 *
 * **An already-verified caller is re-sent the link rather than refused.** The
 * settings button that calls this is only offered while the address is
 * unverified, so reaching this route already-verified means the state changed
 * under a stale page — and the honest answer to "send me the link" is to send
 * it. The link is idempotent (`email-verification.ts`), so the mail it delivers
 * confirms what is already true instead of doing anything a second time; a
 * special-cased no-op would only teach the client to distinguish two outcomes
 * that are the same outcome.
 *
 * **Rate-limited in the database, exactly as feedback is.** Sending yourself
 * mail reaches nobody else's data, but every send spends one message from the
 * shared Brevo quota — the same quota password-reset mail draws on — so a
 * caller leaning on the button degrades other people's ability to get back into
 * their accounts. Six per hour, counted in Postgres rather than in this process,
 * because an in-memory counter is per-instance, resets on deploy, and is not on
 * the only path in.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: ["customer", "gamer", "gedu", "admin"],

  handler: async ({ request, supabase, profile }) => {
    // The real gate. A gamer's entitlement depends on their sign-in mode, which
    // lives one table over, so it is read here rather than guessed from the role.
    if (profile.role === "gamer") {
      const { data: gamerProfile, error: modeError } = await supabase
        .from("gamer_profiles")
        .select("sign_in")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (modeError) throw modeError;
      if (!hasRealEmail({ role: profile.role, sign_in: gamerProfile?.sign_in })) {
        return NextResponse.json(
          { error: "This account has no email address to verify." },
          { status: 403 },
        );
      }
    }

    // No address on file → nothing to verify and nowhere to send. Answering
    // success keeps the client's one path; there is no state to report. Ahead of
    // the rate-limit check on purpose: no mail leaves, so nothing should be
    // charged for it.
    if (!profile.email) return { success: true };

    // Atomic rate-limit check + insert via a self-scoping RPC on the USER-bound
    // client: `request_my_verification_email` writes a row for `auth.uid()` and
    // takes no parameter naming a user, so this handler cannot spend anyone
    // else's allowance — or exempt itself from its own.
    //
    // The allowance is spent BEFORE the Brevo call, so a send that fails burns
    // one of six. Deliberate trade: charging after the send would reopen the
    // concurrent-double-send window the advisory lock exists to close, and a
    // Brevo outage long enough to burn all six self-heals within the hour.
    const { data: accepted, error: rpcError } = await supabase.rpc(
      "request_my_verification_email",
    );
    if (rpcError) throw rpcError;
    if (!accepted) {
      return NextResponse.json(
        { error: "Too many verification emails requested. Please try again later." },
        { status: 429 },
      );
    }

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
