import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import { createPinResetToken } from "@/lib/pin-session";
import { buildPinResetEmail } from "@/lib/email-templates/pin-reset";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { detectLocaleFromHeader, isSupportedLocale } from "@/lib/constants/locales";
import { getOrigin } from "@/lib/url";

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

  // Bind the token to the current PIN hash so it's single-use: completing the
  // reset rotates the hash and the token stops validating (see pin-session.ts).
  // Read via the admin client (bypasses RLS; the hash never leaves the server).
  const admin = createAdminClient();
  const { data: cp } = await admin
    .from("customer_profiles")
    .select("pin_hash")
    .eq("user_id", user.id)
    .single();

  // Build the emailed link off the TRUSTED origin, not the raw Host header.
  // `getOrigin` accepts the incoming Host only if it matches a known-trusted
  // source, else falls back to canonical NEXT_PUBLIC_SITE_URL — so a spoofed
  // `Host: evil.com` can't turn this reset link (which carries a valid token)
  // into a credential-phishing URL. See src/lib/url.ts.
  const origin = getOrigin(request);
  const token = await createPinResetToken(user.id, cp?.pin_hash ?? "", Date.now());
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
