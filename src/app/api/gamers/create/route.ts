import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateGamerEmail } from "@/lib/utils";

export async function POST(request: Request) {
  try {
    const result = await requireRole("customer", {
      forbiddenMessage: "Only customers can create gamer accounts",
    });
    if (result instanceof NextResponse) return result;
    const { user } = result;

    const { username, password, displayName, dateOfBirth, gender } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    if (!displayName || typeof displayName !== "string") {
      return NextResponse.json(
        { error: "Display name is required" },
        { status: 400 }
      );
    }

    if (!dateOfBirth || typeof dateOfBirth !== "string") {
      return NextResponse.json(
        { error: "Date of birth is required" },
        { status: 400 }
      );
    }

    const validGenders = ["boy", "girl", "non_binary"];
    if (!gender || !validGenders.includes(gender)) {
      return NextResponse.json(
        { error: "Gender is required (boy, girl, or non_binary)" },
        { status: 400 }
      );
    }

    const syntheticEmail = generateGamerEmail(username);
    const admin = createAdminClient();

    // Create auth user with admin client — no confirmation email sent
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email: syntheticEmail,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
          role: "gamer",
          username,
        },
      });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: "Failed to create gamer account" },
        { status: 500 }
      );
    }

    // Wait for the database trigger to create the profile
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Fetch the created profile
    const { data: gamerProfile, error: profileError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", authData.user.id)
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    // Set date_of_birth and gender on gamer_profiles
    const { error: gamerProfileError } = await admin
      .from("gamer_profiles")
      .update({ date_of_birth: dateOfBirth, gender })
      .eq("user_id", authData.user.id);

    if (gamerProfileError) {
      return NextResponse.json(
        { error: gamerProfileError.message },
        { status: 500 }
      );
    }

    // Create parent-gamer link
    const { data: linkData, error: linkError } = await admin
      .from("parent_gamer")
      .insert({
        parent_id: user.id,
        gamer_id: authData.user.id,
      })
      .select()
      .single();

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }

    return NextResponse.json({ gamer: gamerProfile, link: linkData });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
