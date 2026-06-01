import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateGamerEmail } from "@/lib/utils";
import { lookupMinecraftUser, isValidMinecraftUsername } from "@/lib/mojang";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";

type GenderValue = "boy" | "girl" | "non_binary";
const VALID_GENDERS: readonly GenderValue[] = ["boy", "girl", "non_binary"];

// Internal handle + password. Opaque on purpose: the parent never sees
// either (gamer login is via account-switching from the parent).
function generateOpaqueGamerUsername(): string {
  return "g" + randomBytes(8).toString("hex");
}

function generateOpaqueGamerPassword(): string {
  return randomBytes(24).toString("base64url");
}

export async function POST(request: Request) {
  try {
    const result = await requireRole("customer", {
      forbiddenMessage: "Switch to a parent account to add a gamer.",
    });
    if (result instanceof NextResponse) return result;
    const { user } = result;

    const body = await request.json();
    const { firstName, dateOfBirth, gender: providedGender, minecraftUsername } = body;

    if (!firstName || typeof firstName !== "string" || firstName.trim().length < DISPLAY_NAME_MIN || firstName.trim().length > DISPLAY_NAME_MAX) {
      return NextResponse.json(
        { error: `First name must be between ${DISPLAY_NAME_MIN} and ${DISPLAY_NAME_MAX} characters` },
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

    let gender: GenderValue | null;
    if (providedGender === undefined || providedGender === null || providedGender === "") {
      gender = null;
    } else if (typeof providedGender === "string" && (VALID_GENDERS as readonly string[]).includes(providedGender)) {
      gender = providedGender as GenderValue;
    } else {
      return NextResponse.json(
        { error: "Gender must be boy, girl, or non_binary" },
        { status: 400 }
      );
    }

    const password = generateOpaqueGamerPassword();
    const admin = createAdminClient();

    // Belt-and-braces: 64 bits of entropy means collisions are
    // vanishingly improbable, but check once and retry once just in case.
    let username = generateOpaqueGamerUsername();
    const { data: collision } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (collision) {
      username = generateOpaqueGamerUsername();
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

    // Snapshot the parent's last_name onto the gamer at creation time. The
    // parent's UI never asks for the gamer's last_name; we copy it once here
    // and never sync. TODO(name-sync): if a parent later changes their
    // last_name, gamer profiles do not auto-update. Track as a follow-up.
    const { data: parentProfile } = await admin
      .from("profiles")
      .select("last_name")
      .eq("id", user.id)
      .single();
    const inheritedLastName = parentProfile?.last_name ?? "";

    // Resolve Minecraft account BEFORE creating auth user — the UNIQUE
    // constraint on minecraft_uuid can reject this, and createUser burns
    // the username irreversibly. By checking first, the parent can retry
    // with a different Minecraft name without losing the gamer username.
    let resolvedMinecraft: { username: string; uuid: string | null } | null = null;
    if (minecraftUsername) {
      const mojang = await lookupMinecraftUser(minecraftUsername);
      resolvedMinecraft = {
        username: minecraftUsername,
        uuid: mojang?.uuid ?? null,
      };

      if (resolvedMinecraft.uuid) {
        const { data: existingMc } = await admin
          .from("minecraft_accounts")
          .select("user_id")
          .eq("minecraft_uuid", resolvedMinecraft.uuid)
          .maybeSingle();

        if (existingMc) {
          return NextResponse.json(
            { error: "This Minecraft account is already linked to another user" },
            { status: 409 },
          );
        }
      }
    }

    // Compose display_name for the Supabase auth dashboard label.
    const composedDisplayName = [firstName, inheritedLastName]
      .filter(Boolean)
      .join(" ");

    // Step 1: Create auth user — trigger assigns customer role by default
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email: syntheticEmail,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: inheritedLastName,
          display_name: composedDisplayName,
        },
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
        first_name: firstName,
        last_name: inheritedLastName,
      })
      .eq("id", gamerId);

    if (promoteError) {
      return NextResponse.json(
        { error: promoteError.message },
        { status: 500 }
      );
    }

    await admin.from("customer_profiles").delete().eq("user_id", gamerId);

    const { error: gamerProfileError } = await admin
      .from("gamer_profiles")
      .insert({
        user_id: gamerId,
        date_of_birth: dateOfBirth,
        gender,
      });

    if (gamerProfileError) {
      return NextResponse.json(
        { error: gamerProfileError.message },
        { status: 500 }
      );
    }

    if (resolvedMinecraft) {
      const { error: mcError } = await admin
        .from("minecraft_accounts")
        .insert({
          user_id: gamerId,
          minecraft_username: resolvedMinecraft.username,
          minecraft_uuid: resolvedMinecraft.uuid,
        });

      if (mcError) {
        // UNIQUE constraint race (another request claimed the UUID between our check and insert)
        const message = mcError.code === "23505"
          ? "This Minecraft account is already linked to another user"
          : mcError.message;
        return NextResponse.json(
          { error: message },
          { status: mcError.code === "23505" ? 409 : 500 },
        );
      }
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
