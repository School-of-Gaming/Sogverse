import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateGamerEmail } from "@/lib/utils";
import { lookupMinecraftUser, isValidMinecraftUsername } from "@/lib/mojang";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";
import { Constants, type GenderType } from "@/types";

// Runtime values of the gender_type DB enum — the source of truth for what
// the gamer_profiles CHECK accepts, so route validation can't drift from it.
const VALID_GENDERS = Constants.public.Enums.gender_type;

function isGenderValue(value: unknown): value is GenderType {
  return (
    typeof value === "string" &&
    (VALID_GENDERS as readonly string[]).includes(value)
  );
}

// Local part of the gamer's synthetic email + password. Opaque on purpose:
// the parent never sees either (gamer login is via account-switching from the
// parent, not credentials they type).
function generateGamerEmailLocalPart(): string {
  return "g" + randomBytes(8).toString("hex");
}

function generateOpaqueGamerPassword(): string {
  return randomBytes(24).toString("base64url");
}

export async function POST(request: Request) {
  // Hoisted so the catch can clean up: once the auth user is created, any later
  // throw would orphan it (a login with no usable gamer record). The create_gamer
  // RPC is transactional, so the DB itself is always left untouched on failure —
  // this marker only tracks the auth-user side that lives outside that transaction.
  const admin = createAdminClient();
  let createdAuthUserId: string | null = null;
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

    let gender: GenderType | null;
    if (providedGender === undefined || providedGender === null || providedGender === "") {
      gender = null;
    } else if (isGenderValue(providedGender)) {
      gender = providedGender;
    } else {
      return NextResponse.json(
        { error: "Gender must be boy, girl, or non_binary" },
        { status: 400 }
      );
    }

    const password = generateOpaqueGamerPassword();

    // Belt-and-braces: 64 bits of entropy means collisions are
    // vanishingly improbable, but check once and retry once just in case.
    let syntheticEmail = generateGamerEmail(generateGamerEmailLocalPart());
    const { data: collision } = await admin
      .from("profiles")
      .select("id")
      .eq("email", syntheticEmail)
      .maybeSingle();
    if (collision) {
      syntheticEmail = generateGamerEmail(generateGamerEmailLocalPart());
    }

    if (minecraftUsername !== undefined && minecraftUsername !== null) {
      if (typeof minecraftUsername !== "string" || !isValidMinecraftUsername(minecraftUsername)) {
        return NextResponse.json(
          { error: "Invalid Minecraft username. Must be 3-16 characters: letters, numbers, underscores." },
          { status: 400 }
        );
      }
    }

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
    createdAuthUserId = gamerId;

    // Step 2: Promote + link atomically. handle_new_user already seeded a
    // 'customer' profile + customer_profiles row for the new auth user; this
    // RPC swaps it to a gamer, inserts the gamer/minecraft rows, and links the
    // parent — all in one transaction, so a failure can't leave a half-promoted
    // orphan (see migration 00113). The synthetic email the trigger copied from
    // auth.users is left untouched (gamers are email-first).
    const { error: rpcError } = await admin.rpc("create_gamer", {
      p_gamer_id: gamerId,
      p_parent_id: user.id,
      p_first_name: firstName,
      p_last_name: inheritedLastName,
      p_date_of_birth: dateOfBirth,
      // Omit (→ undefined) rather than pass null: the RPC params default to
      // null, and the generated Args type accepts undefined, not null. A null
      // Mojang UUID still inserts a Minecraft row (username present, uuid null).
      p_gender: gender ?? undefined,
      p_minecraft_username: resolvedMinecraft?.username ?? undefined,
      p_minecraft_uuid: resolvedMinecraft?.uuid ?? undefined,
    });

    if (rpcError) {
      // The RPC ran in a transaction, so no partial gamer record persisted —
      // but the auth user we created above would now be orphaned (a login with
      // no usable gamer record), so delete it before returning the error.
      await admin.auth.admin.deleteUser(gamerId);

      // The only unique constraint create_gamer can hit is minecraft_uuid: the
      // 00114 guard makes a double-promote raise P0001 (not 23505) before any
      // insert runs, and gamer_profiles/parent_gamer can't collide for a
      // brand-new id. So a 23505 unambiguously means the minecraft_uuid race
      // (claimed between our pre-check and the RPC's insert) — map it to the
      // same 409 as before. Revisit this mapping if a future unique constraint
      // is added inside the RPC.
      const isMinecraftConflict = rpcError.code === "23505";
      if (!isMinecraftConflict) {
        // Anything else is an internal failure (a constraint, the promote
        // guard's raise, a connection error). Log the raw error for debugging
        // but never surface it: it's Postgres text the parent shouldn't see,
        // and there's nothing actionable in it for them.
        console.error("create_gamer RPC failed", rpcError);
      }
      return NextResponse.json(
        {
          error: isMinecraftConflict
            ? "This Minecraft account is already linked to another user"
            : "Something went wrong creating the gamer. Please try again.",
        },
        { status: isMinecraftConflict ? 409 : 500 },
      );
    }

    // The RPC committed, so the gamer exists. Return only its id — the sole
    // thing callers consume (to pre-select the new gamer). The client invalidates
    // the gamers list on success and refetches the full row from there, so there's
    // no reason to read it back here.
    return NextResponse.json({ gamerId });
  } catch {
    // A throw anywhere after the auth user was created (an rpc/network error, a
    // thrown deleteUser, a read-back failure) would orphan it. The RPC is
    // transactional, so the DB is already untouched; delete the auth user so a
    // retry starts from a clean slate rather than colliding or piling up.
    if (createdAuthUserId) {
      await admin.auth.admin.deleteUser(createdAuthUserId);
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
