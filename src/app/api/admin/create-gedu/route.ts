import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import { SENDER_EMAIL, SENDER_NAME_AUTH } from "@/lib/constants";
import { ROUTES } from "@/lib/constants/routes";
import { buildGeduInviteEmail } from "@/lib/email-templates/gedu-invite";

export async function POST(request: Request) {
  try {
    const result = await requireRole("admin", {
      forbiddenMessage: "Only admins can create gedu accounts",
    });
    if (result instanceof NextResponse) return result;

    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const origin = new URL(request.url).origin;
    const admin = createAdminClient();

    // Step 1: Generate invite link — this creates the user AND returns a signed,
    // time-limited link in one atomic operation. The handle_new_user trigger fires
    // and assigns customer role by default; display_name defaults to 'New User'.
    // generateLink() has no PKCE challenge, so Supabase's verify endpoint
    // redirects with implicit flow (tokens in URL hash). The setup-account
    // page parses these and calls setSession() manually.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo: `${origin}${ROUTES.setupAccount}`,
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
      .update({ role: "gedu" })
      .eq("id", userId);

    if (roleError) {
      return NextResponse.json({ error: roleError.message }, { status: 500 });
    }

    // Remove the customer_profiles row the trigger created
    await admin.from("customer_profiles").delete().eq("user_id", userId);

    // Step 3: Send welcome email via Brevo with the invite link.
    // If the email fails, roll back by deleting the user so there's no dead account.
    try {
      await sendTransactionalEmail({
        fromEmail: SENDER_EMAIL,
        fromName: SENDER_NAME_AUTH,
        toEmail: email,
        subject: "You're invited to The Sogverse",
        htmlContent: buildGeduInviteEmail(data.properties.action_link),
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
