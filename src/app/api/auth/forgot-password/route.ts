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
      adminClient.auth.admin.generateLink({
        type: "recovery",
        email: parsed.data.email,
        options: {
          // generateLink() has no PKCE challenge, so Supabase's verify endpoint
          // redirects with implicit flow (tokens in URL hash). The reset-password
          // form parses these and calls setSession() manually.
          redirectTo: `${origin}${ROUTES.resetPassword}`,
        },
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

    await sendTransactionalEmail({
      fromEmail: SENDER_EMAIL,
      fromName: t("senderAuth"),
      toEmail: parsed.data.email,
      subject: t("passwordReset.subject"),
      htmlContent: buildPasswordResetEmail(t, linkResult.data.properties.action_link, locale),
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
