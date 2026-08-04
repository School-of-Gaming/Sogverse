import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateGamerEmail } from "@/lib/utils";
import { lookupMinecraftUser } from "@/lib/mojang";
import { lookupRobloxProfile } from "@/lib/roblox";
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

  // The body's hand-rolled `typeof` checks are now the shared schema. Every RPC
  // failure is logged and answered generically, which is what this route already
  // did deliberately ("it's Postgres text the parent shouldn't see").

  handler: async ({ user, body }) => {
    const admin = createAdminClient();
    const {
      firstName,
      dateOfBirth,
      gender: providedGender,
      minecraftUsername,
      robloxUsername,
    } = body;

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

    // Resolve the optional game accounts before creating the auth user, so a
    // Mojang or Roblox outage costs nothing rather than an auth user created and
    // then compensated away. Nothing here can reject a username: another
    // Sogverse account may already hold it (siblings share accounts), and one
    // the platform can't resolve is stored as-typed with a null account key.
    //
    // The two lookups are independent reads of two unrelated third parties, so
    // they run together — a child with both handles waits for the slower one
    // rather than for the sum.
    const [resolvedMinecraft, resolvedRoblox] = await Promise.all([
      minecraftUsername
        ? lookupMinecraftUser(minecraftUsername).then((mojang) => ({
            username: minecraftUsername,
            uuid: mojang?.uuid ?? null,
          }))
        : null,
      robloxUsername
        ? lookupRobloxProfile(robloxUsername).then((profile) => ({
            username: robloxUsername,
            userId: profile?.userId ?? null,
          }))
        : null,
    ]);

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
        // account key still inserts the row (username present, key null) on
        // either platform.
        p_gender: gender ?? undefined,
        p_minecraft_username: resolvedMinecraft?.username ?? undefined,
        p_minecraft_uuid: resolvedMinecraft?.uuid ?? undefined,
        p_roblox_username: resolvedRoblox?.username ?? undefined,
        p_roblox_user_id: resolvedRoblox?.userId ?? undefined,
      });

      if (rpcError) {
        // The RPC ran in a transaction, so no partial gamer record persisted —
        // but the auth user we created above would now be orphaned, so delete
        // it before returning the error.
        await deleteOrphanedAuthUser(admin, gamerId);

        // Every failure here is internal (a constraint, the promote guard's
        // raise, a connection error) — none of them is something the parent can
        // act on. Log the raw error for debugging but never surface it: it's
        // Postgres text the parent shouldn't see.
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
