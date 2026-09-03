import "server-only";

import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import {
  detectLocaleFromHeader,
  isSupportedLocale,
} from "@/lib/constants/locales";
import { createEmailVerificationToken } from "@/lib/email-verification";
import { buildGamerWelcomeEmail } from "@/lib/email-templates/gamer-welcome";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { isSyntheticGamerEmail } from "@/lib/gamer-sign-in";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrigin } from "@/lib/url";

/**
 * Send a child the mail that welcomes them to their own account and carries the
 * link that verifies its address.
 *
 * Three routes send this exact mail — creating a gamer in `email` mode, changing
 * one into that mode, and the parent's explicit resend — so it lives here rather
 * than three times over. What is NOT here is the decision about whether to send:
 * the rate limit belongs to the resend route (a parent leaning on the button
 * spends the shared mail quota), and creation is not rate-limited because
 * creating an account is.
 *
 * **It throws, and the caller decides what that means.** After a creation the
 * account already exists and a Brevo outage must not unwind it, so that caller
 * logs and swallows. A resend IS the outcome the parent asked for, so that
 * caller lets the failure answer.
 *
 * **It refuses a synthetic address rather than mailing one.** A child in
 * `username` or `parent` mode has an address nobody reads, and a send there is a
 * message into a void — the kind of no-op that looks like a working feature
 * until somebody asks why no mail arrived. Refusing loudly is the honest answer
 * to a caller that got the mode wrong.
 */
export async function sendGamerWelcomeEmail(args: {
  request: Request;
  gamerId: string;
  /** The parent doing the setting-up. Named in the mail, so the child knows why. */
  parentFirstName: string;
}): Promise<void> {
  const { request, gamerId, parentFirstName } = args;
  const admin = createAdminClient();

  // Read the child's row rather than taking these as parameters: the address is
  // the thing the token is bound to, and it has to be the one actually stored
  // (GoTrue normalises on the way in, and a token minted against the typed
  // string would never verify).
  const { data: gamer, error } = await admin
    .from("profiles")
    .select("email, first_name, locale")
    .eq("id", gamerId)
    .single();

  if (error) throw error;
  if (!gamer.email || isSyntheticGamerEmail(gamer.email)) {
    throw new Error(
      `gamer ${gamerId} has no real address to welcome — nothing was sent`,
    );
  }

  // The TRUSTED origin, never the raw Host header. This link goes in an email
  // and carries a signed token, so a spoofed `Host: evil.com` would turn it into
  // a phishing URL the recipient has every reason to trust.
  const origin = getOrigin(request);
  const token = await createEmailVerificationToken(gamerId, gamer.email);
  const verificationUrl = `${origin}${ROUTES.verifyEmail}?token=${encodeURIComponent(token)}`;

  // The CHILD's locale, because the child is the reader. It is seeded from the
  // account's default at creation and is theirs to change afterwards; the
  // request's own Accept-Language is the fallback, which on a create is the
  // parent's browser and is the best guess available for a family.
  const locale = isSupportedLocale(gamer.locale)
    ? gamer.locale
    : detectLocaleFromHeader(request.headers.get("Accept-Language"));
  const t = await getEmailTranslator(locale);

  await sendTransactionalEmail({
    fromEmail: SENDER_EMAIL,
    fromName: SENDER_NAME,
    toEmail: gamer.email,
    subject: t("gamerWelcome.subject"),
    htmlContent: buildGamerWelcomeEmail(t, locale, {
      gamerFirstName: gamer.first_name,
      parentFirstName,
      verificationUrl,
    }),
    // Product mail to a person: a child (or the parent reading over their
    // shoulder) replying to this is asking us something, so the reply goes to
    // the monitored support inbox rather than the unattended sending address.
    replyToEmail: SUPPORT_EMAIL,
  });
}
