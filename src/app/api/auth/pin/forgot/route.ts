import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import { createPinResetToken } from "@/lib/pin-session";
import { buildPinResetEmail } from "@/lib/email-templates/pin-reset";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { detectLocaleFromHeader, isSupportedLocale } from "@/lib/constants/locales";

/**
 * Email the signed PIN-reset link to the parent's own inbox. Reachable from the
 * lock gate (allowUnverified), so the link goes ONLY to the account email — a
 * child triggering this just sends mail to the parent, gaining nothing.
 */
export async function POST(request: Request) {
  const auth = await requireRole("customer", { allowUnverified: true });
  if (auth instanceof NextResponse) return auth;
  const { user, profile } = auth;

  // No email on file → nothing to send. Succeed silently (no info leak).
  if (!profile.email) {
    return NextResponse.json({ success: true });
  }

  const origin = new URL(request.url).origin;
  const token = await createPinResetToken(user.id, Date.now());
  const resetLink = `${origin}${ROUTES.resetPin}?token=${encodeURIComponent(token)}`;

  const pref = profile.locale;
  const locale = isSupportedLocale(pref)
    ? pref
    : detectLocaleFromHeader(request.headers.get("Accept-Language"));
  const t = await getEmailTranslator(locale);

  await sendTransactionalEmail({
    fromEmail: SENDER_EMAIL,
    fromName: t("senderAuth"),
    toEmail: profile.email,
    subject: t("pinReset.subject"),
    htmlContent: buildPinResetEmail(t, resetLink, locale),
  });

  return NextResponse.json({ success: true });
}
