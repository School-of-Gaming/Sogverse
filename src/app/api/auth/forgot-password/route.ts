import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME_AUTH } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import { buildPasswordResetEmail } from "@/lib/email-templates/password-reset";

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

    const origin = new URL(request.url).origin;
    const adminClient = createAdminClient();

    const { data, error } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: parsed.data.email,
      options: {
        // generateLink() has no PKCE challenge, so Supabase's verify endpoint
        // redirects with implicit flow (tokens in URL hash). The reset-password
        // form parses these and calls setSession() manually.
        redirectTo: `${origin}${ROUTES.resetPassword}`,
      },
    });

    if (error) {
      // Don't leak whether the email exists — log and return success
      console.error("generateLink error:", error.message);
      return NextResponse.json({ success: true });
    }

    await sendTransactionalEmail({
      fromEmail: SENDER_EMAIL,
      fromName: SENDER_NAME_AUTH,
      toEmail: parsed.data.email,
      subject: "Reset your Sogverse password",
      htmlContent: buildPasswordResetEmail(data.properties.action_link),
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
