import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const result = await requireRole("admin", {
      forbiddenMessage: "Only admins can create gedu accounts",
    });
    if (result instanceof NextResponse) return result;

    const { email, password, displayName } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    if (!displayName || typeof displayName !== "string") {
      return NextResponse.json(
        { error: "Display name is required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Step 1: Create auth user — trigger assigns customer role by default
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
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

    return NextResponse.json({ user: data.user });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
