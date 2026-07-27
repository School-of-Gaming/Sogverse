import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateGamerEmail } from "@/lib/utils";
import { lookupMinecraftUser } from "@/lib/mojang";
import { createGamerBody } from "@/services/gamers/gamers.contracts";
import type { GenderType } from "@/types";

// Local part of the gamer's synthetic email + password. Opaque on purpose:
// the parent never sees either (gamer login is via account-switching from the
// parent, not credentials they type).
function generateGamerEmailLocalPart(): string {
  return "g" + randomBytes(8).toString("hex");
}

function generateOpaqueGamerPassword(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * POST /api/gamers/create — a parent adds a child account.
 *
 * The auth user is created before the promotion RPC runs, so any failure after
 * that point would orphan it (a login with no usable gamer record). The RPC is
 * transactional, so the database is always left untouched on failure; the
 * compensating delete below covers the auth-user side that lives outside that
 * transaction, including the case where the wrapper's catch is what ends the
 * request.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "customer",
  forbiddenMessage: "Switch to a parent account to add a gamer.",
  body: createGamerBody,

  // The body's hand-rolled `typeof` checks are now the shared schema. The RPC's
  // only reachable unique violation is the Minecraft UUID race, which keeps its
  // explicit 409 and its stable `code` because the client maps it; every other
  // failure is logged and answered generically, which is what this route
  // already did deliberately ("it's Postgres text the parent shouldn't see").

  handler: async ({ user, body }) => {
    const admin = createAdminClient();
    const { firstName, dateOfBirth, gender: providedGender, minecraftUsername } = body;

    const dobDate = new Date(dateOfBirth + "T00:00:00");
    if (isNaN(dobDate.getTime()) || dobDate > new Date()) {
      return NextResponse.json(
        { error: "Date of birth cannot be in the future" },
        { status: 400 },
      );
    }

    // "" and null both mean "no value recorded".
    const gender: GenderType | null =
      providedGender === undefined ||
      providedGender === null ||
      providedGender === ""
        ? null
        : providedGender;

    const password = generateOpaqueGamerPassword();

    // Belt-and-braces: 64 bits of entropy means collisions are vanishingly
    // improbable, but check once and retry once just in case.
    let syntheticEmail = generateGamerEmail(generateGamerEmailLocalPart());
    const { data: collision } = await admin
      .from("profiles")
      .select("id")
      .eq("email", syntheticEmail)
      .maybeSingle();
    if (collision) {
      syntheticEmail = generateGamerEmail(generateGamerEmailLocalPart());
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

    // Resolve Minecraft account BEFORE creating the auth user — the UNIQUE
    // constraint on minecraft_uuid can reject this, and createUser burns the
    // username irreversibly. By checking first, the parent can retry with a
    // different Minecraft name without losing the gamer username.
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
            {
              error: "This Minecraft account is already linked to another user",
              code: "minecraft_already_linked",
            },
            { status: 409 },
          );
        }
      }
    }

    // Compose display_name for the Supabase auth dashboard label.
    const composedDisplayName = [firstName, inheritedLastName]
      .filter(Boolean)
      .join(" ");

    // Step 1: Create auth user — trigger assigns customer role by default.
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
      console.error("gamer creation: createUser failed", authError);
      return NextResponse.json(
        { error: "Something went wrong creating the gamer. Please try again." },
        { status: 400 },
      );
    }

    const gamerId = authData.user.id;

    try {
      // Step 2: Promote + link atomically. handle_new_user already seeded a
      // 'customer' profile + customer_profiles row for the new auth user; this
      // RPC swaps it to a gamer, inserts the gamer/minecraft rows, and links the
      // parent — all in one transaction, so a failure can't leave a
      // half-promoted orphan. The synthetic email the trigger copied from
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
        // but the auth user we created above would now be orphaned, so delete
        // it before returning the error.
        await deleteOrphanedAuthUser(admin, gamerId);

        // The only unique constraint create_gamer can hit is minecraft_uuid:
        // the double-promote guard raises P0001 (not 23505) before any insert
        // runs, and gamer_profiles/parent_gamer can't collide for a brand-new
        // id. So a 23505 unambiguously means the minecraft_uuid race (claimed
        // between our pre-check and the RPC's insert). Revisit this mapping if
        // a future unique constraint is added inside the RPC.
        if (rpcError.code === "23505") {
          return NextResponse.json(
            {
              error: "This Minecraft account is already linked to another user",
              code: "minecraft_already_linked",
            },
            { status: 409 },
          );
        }

        // Anything else is an internal failure (a constraint, the promote
        // guard's raise, a connection error). Log the raw error for debugging
        // but never surface it: it's Postgres text the parent shouldn't see,
        // and there's nothing actionable in it for them.
        console.error("create_gamer RPC failed", rpcError);
        return NextResponse.json(
          {
            error:
              "Something went wrong creating the gamer. Please try again.",
          },
          { status: 500 },
        );
      }
    } catch (err) {
      // A throw anywhere after the auth user was created would orphan it. The
      // RPC is transactional, so the database is already untouched; delete the
      // auth user so a retry starts from a clean slate rather than colliding or
      // piling up. The wrapper's catch then turns this into a logged 500.
      await deleteOrphanedAuthUser(admin, gamerId);
      throw err;
    }

    // The RPC committed, so the gamer exists. Return only its id — the sole
    // thing callers consume (to pre-select the new gamer). The client
    // invalidates the gamers list on success and refetches the full row from
    // there, so there's no reason to read it back here.
    return { gamerId };
  },
});

// Best-effort cleanup of the auth user when post-auth creation fails. If the
// delete itself fails we can't do anything useful — but we must record it: that
// id is now a genuine orphan (an auth user with no usable gamer record), and
// this log line is the only trace of it.
async function deleteOrphanedAuthUser(
  admin: ReturnType<typeof createAdminClient>,
  authUserId: string,
): Promise<void> {
  try {
    const { error } = await admin.auth.admin.deleteUser(authUserId);
    if (error) {
      console.error("orphaned auth user cleanup failed", authUserId, error);
    }
  } catch (cleanupErr) {
    console.error("orphaned auth user cleanup threw", authUserId, cleanupErr);
  }
}
