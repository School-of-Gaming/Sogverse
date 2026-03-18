import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateGamerEmail } from "@/lib/utils";
import { lookupMinecraftUser, isValidMinecraftUsername } from "@/lib/mojang";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const result = await requireRole("customer", {
      forbiddenMessage: "Only customers can create gamer accounts",
    });
    if (result instanceof NextResponse) return result;
    const { user } = result;

    const body = await request.json();
    const { username, password, displayName, dateOfBirth, gender, minecraftUsername } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    if (!displayName || typeof displayName !== "string" || displayName.trim().length < DISPLAY_NAME_MIN || displayName.trim().length > DISPLAY_NAME_MAX) {
      return NextResponse.json(
        { error: `Display name must be between ${DISPLAY_NAME_MIN} and ${DISPLAY_NAME_MAX} characters` },
        { status: 400 }
      );
    }

    if (!dateOfBirth || typeof dateOfBirth !== "string") {
      return NextResponse.json(
        { error: "Date of birth is required" },
        { status: 400 }
      );
    }

    const dobDate = new Date(dateOfBirth + "T00:00:00");
    if (isNaN(dobDate.getTime()) || dobDate > new Date()) {
      return NextResponse.json(
        { error: "Date of birth cannot be in the future" },
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

    if (minecraftUsername !== undefined && minecraftUsername !== null) {
      if (typeof minecraftUsername !== "string" || !isValidMinecraftUsername(minecraftUsername)) {
        return NextResponse.json(
          { error: "Invalid Minecraft username. Must be 3-16 characters: letters, numbers, underscores." },
          { status: 400 }
        );
      }
    }

    const syntheticEmail = generateGamerEmail(username);
    const admin = createAdminClient();

    // Check if username is already taken before attempting to create
    const { data: existingUser } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (existingUser) {
      return NextResponse.json(
        { error: "This username is already taken" },
        { status: 409 }
      );
    }

    // Step 1: Create auth user — trigger assigns customer role by default
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email: syntheticEmail,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const gamerId = authData.user.id;

    // Step 2: Promote to gamer — update profile, swap extension tables
    const { error: promoteError } = await admin
      .from("profiles")
      .update({
        role: "gamer",
        email: null,
        username,
        display_name: displayName,
      })
      .eq("id", gamerId);

    if (promoteError) {
      return NextResponse.json(
        { error: promoteError.message },
        { status: 500 }
      );
    }

    await admin.from("customer_profiles").delete().eq("user_id", gamerId);

    // Resolve Minecraft UUID if username provided
    let mcData: { minecraft_username?: string; minecraft_uuid?: string | null } = {};
    if (minecraftUsername) {
      const mojang = await lookupMinecraftUser(minecraftUsername);
      mcData = {
        minecraft_username: minecraftUsername,
        minecraft_uuid: mojang?.uuid ?? null,
      };
    }

    const { error: gamerProfileError } = await admin
      .from("gamer_profiles")
      .insert({
        user_id: gamerId,
        date_of_birth: dateOfBirth,
        gender,
        ...mcData,
      });

    if (gamerProfileError) {
      return NextResponse.json(
        { error: gamerProfileError.message },
        { status: 500 }
      );
    }

    // Step 3: Link gamer to parent (validate_parent_gamer_roles trigger
    // checks both roles, so this must happen after the promote)
    const { data: linkData, error: linkError } = await admin
      .from("parent_gamer")
      .insert({
        parent_id: user.id,
        gamer_id: gamerId,
      })
      .select()
      .single();

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }

    // Fetch the final gamer profile
    const { data: gamerProfile, error: fetchError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", gamerId)
      .single();

    if (fetchError) {
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ gamer: gamerProfile, link: linkData });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
