import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { lookupMinecraftUser } from "@/lib/mojang";
import { lookupRobloxProfile } from "@/lib/roblox";
import {
  adminGameAccountBody,
  adminGameAccountWriteResult,
} from "@/services/users/users.contracts";

/**
 * PATCH /api/admin/users/[id]/game-account — an admin setting or clearing
 * somebody else's game username, on either platform.
 *
 * **One route for both platforms, unlike the three that came before it.** The
 * self-serve routes and the gedu one are each single-platform because each of
 * their surfaces is: a person editing their own Minecraft name is not editing a
 * Roblox one in the same breath. The admin user page is the first surface whose
 * subject is *a person's game identities*, plural, and the platform there is
 * data — which is exactly what the discriminated-union body makes it, with each
 * platform's format rule still attached to its own branch.
 *
 * **The write runs on the user-bound client**, so the database is what enforces
 * "you must be an admin": `admin_full_access_minecraft_accounts` and
 * `admin_full_access_roblox_accounts` are `FOR ALL` policies over `is_admin()`,
 * and `authenticated` holds only SELECT/INSERT/UPDATE on both tables. So the
 * role gate above and the policy underneath have to agree before a row moves,
 * and neither DELETE nor a non-admin write is reachable from here at all. No
 * service-role client is involved, and none is needed.
 *
 * **The target is authorized too, and to the same standard the self-serve route
 * holds itself to**: that route is role-gated to gamers and gedus, so those are
 * the only accounts that can hold a game identity, and an admin writing one onto
 * a parent or another admin would be creating a row no other code path could
 * have produced. An id naming nobody is a 404; an id naming the wrong kind of
 * account is a 400, because it is a request that does not make sense rather than
 * a permission the caller lacks.
 *
 * The lookup is re-run here for the same reason every other write path re-runs
 * it: a client-verified name is not evidence, and on Roblox the browser could
 * not have obtained the account id in the first place.
 */
export const PATCH = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can edit another user's game username",
  params: z.object({ id: z.string().uuid() }),
  body: adminGameAccountBody,
  response: adminGameAccountWriteResult,

  handler: async ({ supabase, params, body }) => {
    const userId = params.id;

    // Read the target through the same RLS-bound client that will do the write.
    // An admin may read every profile, so a miss here really is "no such user".
    const { data: target, error: targetError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (targetError) throw targetError;

    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (target.role !== "gamer" && target.role !== "gedu") {
      return NextResponse.json(
        { error: "Only gamers and game educators can hold a game username" },
        { status: 400 },
      );
    }

    // Branch rather than table-name-by-lookup: the generated Insert types are
    // per table, so a dynamic name would throw away the compiler's check on the
    // very payload this route exists to write.
    if (body.platform === "minecraft") {
      const { username } = body;
      const uuid =
        username === null
          ? null
          : ((await lookupMinecraftUser(username))?.uuid ?? null);

      const { error } = await supabase
        .from("minecraft_accounts")
        .upsert(
          {
            user_id: userId,
            minecraft_username: username,
            minecraft_uuid: uuid,
          },
          { onConflict: "user_id" },
        );

      if (error) throw error;

      return {
        success: true as const,
        platform: "minecraft" as const,
        username,
        externalId: uuid,
      };
    }

    const { username } = body;
    const robloxUserId =
      username === null
        ? null
        : ((await lookupRobloxProfile(username))?.userId ?? null);

    const { error } = await supabase.from("roblox_accounts").upsert(
      {
        user_id: userId,
        roblox_username: username,
        roblox_user_id: robloxUserId,
      },
      { onConflict: "user_id" },
    );

    if (error) throw error;

    return {
      success: true as const,
      platform: "roblox" as const,
      username,
      externalId: robloxUserId,
    };
  },
});
