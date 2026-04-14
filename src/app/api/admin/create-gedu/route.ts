import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import { buildGeduInviteEmail } from "@/lib/email-templates/gedu-invite";
import { getEmailTranslator } from "@/lib/email-templates/translator";
import { resolveLocale } from "@/lib/constants/locales";

export async function POST(request: Request) {
  try {
    const result = await requireRole("admin", {
      forbiddenMessage: "Only admins can create gedu accounts",
    });
    if (result instanceof NextResponse) return result;

    const { email, locale: requestedLocale, displayName } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (typeof displayName !== "string" || displayName.trim().length < DISPLAY_NAME_MIN || displayName.trim().length > DISPLAY_NAME_MAX) {
      return NextResponse.json(
        { error: `Display name must be ${DISPLAY_NAME_MIN}-${DISPLAY_NAME_MAX} characters` },
        { status: 400 }
      );
    }

    const trimmedDisplayName = displayName.trim();
    const locale = resolveLocale(requestedLocale);
    const origin = new URL(request.url).origin;
    const admin = createAdminClient();

    // Step 1: Generate invite link — this creates the user AND returns a signed,
    // time-limited link in one atomic operation. The handle_new_user trigger
    // fires and seeds profiles.display_name from raw_user_meta_data (passed via
    // options.data), then assigns customer role by default. The setup-account
    // form reads the same raw_user_meta_data.display_name to pre-fill its
    // display-name input — the round-trip exists to hydrate the form, not to
    // seed the DB (the trigger has already done that).
    // generateLink() has no PKCE challenge, so Supabase's verify endpoint
    // redirects with implicit flow (tokens in URL hash). The setup-account
    // page parses these and calls setSession() manually.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo: `${origin}${ROUTES.setupAccount}`,
        data: { display_name: trimmedDisplayName },
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Step 2: Promote to gedu — update profile role and swap extension table.
    // The trigger can't assign gedu because GoTrue populates raw_app_meta_data
    // after the INSERT (too late for the trigger to see it).
    const userId = data.user.id;

    const { error: roleError } = await admin
      .from("profiles")
      .update({ role: "gedu", locale })
      .eq("id", userId);

    if (roleError) {
      return NextResponse.json({ error: roleError.message }, { status: 500 });
    }

    // Remove the customer_profiles row the trigger created
    await admin.from("customer_profiles").delete().eq("user_id", userId);

    // Step 3: Send welcome email via Brevo with the invite link.
    // If the email fails, roll back by deleting the user so there's no dead account.
    try {
      const t = await getEmailTranslator(locale);
      await sendTransactionalEmail({
        fromEmail: SENDER_EMAIL,
        fromName: t("senderAuth"),
        toEmail: email,
        subject: t("geduInvite.subject"),
        htmlContent: buildGeduInviteEmail(t, data.properties.action_link, locale, trimmedDisplayName),
      });
    } catch (emailError) {
      console.error("Invite email failed, rolling back user:", emailError instanceof Error ? emailError.message : emailError);
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json(
        { error: "Failed to send invite email. No account was created. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ user: data.user });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
