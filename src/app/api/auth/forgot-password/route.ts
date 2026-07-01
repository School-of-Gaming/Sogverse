import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrigin } from "@/lib/url";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import { buildPasswordResetEmail } from "@/lib/email-templates/password-reset";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { detectLocaleFromHeader, isSupportedLocale } from "@/lib/constants/locales";

const requestSchema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      // Generic response to prevent user enumeration
      return NextResponse.json({ success: true });
    }

    // Trusted origin, never the raw Host/request URL — the reset link goes
    // into an email and carries a recovery token, so a spoofed Host would
    // turn it into an account-takeover phishing link.
    const origin = getOrigin(request);
    const adminClient = createAdminClient();

    // Fetch locale preference and generate reset link in parallel
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
      // Don't leak whether the email exists — log and return success
      console.error("generateLink error:", linkResult.error.message);
      return NextResponse.json({ success: true });
    }

    // Resolve locale: profile preference → Accept-Language header → English
    const pref = profileResult.data?.locale;
    const locale = isSupportedLocale(pref)
      ? pref
      : detectLocaleFromHeader(request.headers.get("Accept-Language"));

    const t = await getEmailTranslator(locale);

    // Email a link to OUR reset page carrying the single-use token_hash — NOT
    // Supabase's action_link. The action_link is a bare GET on /auth/v1/verify
    // that consumes the token on *access*, so corporate email security scanners
    // (SafeLinks / Proofpoint / etc.) that pre-fetch links burn it before the
    // real user clicks. Our page consumes the token via verifyOtp() only when
    // the user submits their new password — a POST from a real interaction that
    // a passive scanner never performs. Origin comes from getOrigin (a trusted
    // source, never the raw Host) since this link is emailed and carries a
    // recovery credential. See src/components/auth/reset-password-form.tsx.
    const resetUrl = `${origin}${ROUTES.resetPassword}?token_hash=${encodeURIComponent(
      linkResult.data.properties.hashed_token,
    )}&type=recovery`;

    await sendTransactionalEmail({
      fromEmail: SENDER_EMAIL,
      fromName: t("senderAuth"),
      toEmail: parsed.data.email,
      subject: t("passwordReset.subject"),
      htmlContent: buildPasswordResetEmail(t, resetUrl, locale),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    // Still return success to prevent enumeration, but log the error
    console.error(
      "Forgot password error:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json({ success: true });
  }
}
