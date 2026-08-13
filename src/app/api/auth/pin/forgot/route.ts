import { defineRoute } from "@/lib/api/define-route";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import { createPinResetToken } from "@/lib/pin-session";
import { buildPinResetEmail } from "@/lib/email-templates/pin-reset";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import {
  detectLocaleFromHeader,
  isSupportedLocale,
} from "@/lib/constants/locales";
import { getOrigin } from "@/lib/url";

/**
 * Email the signed PIN-reset link to the parent's own inbox. Reachable from the
 * lock gate (allowUnverified), so the link goes ONLY to the account email — a
 * child triggering this just sends mail to the parent, gaining nothing.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "customer",
  allowUnverified: true,

  handler: async ({ request, supabase, user, profile }) => {
    // No email on file → nothing to send. Succeed silently (no info leak).
    if (!profile.email) return { success: true };

    // Bind the token to the current PIN hash so it's single-use: completing the
    // reset rotates the hash and the token stops validating. Read on the
    // user-bound client — the caller's own customer_profiles row is inside
    // their RLS view, so nothing here needs the service-role bypass. The hash
    // is used only to derive the signature and never leaves the server.
    const { data: cp } = await supabase
      .from("customer_profiles")
      .select("pin_hash")
      .eq("user_id", user.id)
      .single();

    // Build the emailed link off the TRUSTED origin, not the raw Host header.
    // `getOrigin` accepts the incoming Host only if it matches a known-trusted
    // source, else falls back to canonical NEXT_PUBLIC_SITE_URL — so a spoofed
    // `Host: evil.com` can't turn this reset link (which carries a valid token)
    // into a credential-phishing URL.
    const origin = getOrigin(request);
    const token = await createPinResetToken(
      user.id,
      cp?.pin_hash ?? "",
      Date.now(),
    );
    const resetLink = `${origin}${ROUTES.resetPin}?token=${encodeURIComponent(token)}`;

    const pref = profile.locale;
    const locale = isSupportedLocale(pref)
      ? pref
      : detectLocaleFromHeader(request.headers.get("Accept-Language"));
    const t = await getEmailTranslator(locale);

    await sendTransactionalEmail({
      fromEmail: SENDER_EMAIL,
      fromName: SENDER_NAME,
      toEmail: profile.email,
      subject: t("pinReset.subject"),
      htmlContent: buildPinResetEmail(t, resetLink, locale),
      // A parent who replies to this is a parent who could not get past the
      // PIN gate — exactly the person who needs a human, so replies go to the
      // monitored support inbox rather than the unattended sending address.
      replyToEmail: SUPPORT_EMAIL,
    });

    return { success: true };
  },
});
