import { defineRoute } from "@/lib/api/define-route";
import { lookupMinecraftUser } from "@/lib/mojang";
import { updateMinecraftAccountBody } from "@/services/minecraft/minecraft.contracts";

/**
 * PATCH /api/minecraft/account — link (or unlink) the CALLER'S OWN Minecraft
 * account.
 *
 * Model B: the upsert runs on the user-bound client, so the
 * users_insert_own_minecraft_account / users_update_own_minecraft_account
 * policies re-derive the target row from `auth.uid()`. The row key is the
 * session's user id and is never read from the request, so there is no way to
 * name someone else's row here — and if that ever changed, RLS would refuse it.
 */
export const PATCH = defineRoute({
  posture: "role-gated",
  roles: ["gamer", "gedu"],
  forbiddenMessage: "Only gamers and gedus can update their Minecraft username",
  body: updateMinecraftAccountBody,

  // The codes this route mapped by hand are the shared table's answers already
  // (a policy refusal is a 403). What changes is the fall-through, which used to
  // be a blanket 500 with a fixed message and is now the shared table plus a
  // logged generic message.

  handler: async ({ supabase, user, body }) => {
    const { minecraftUsername } = body;

    const upsertData =
      minecraftUsername === null
        ? {
            user_id: user.id,
            minecraft_username: null,
            minecraft_uuid: null,
          }
        : {
            user_id: user.id,
            minecraft_username: minecraftUsername,
            minecraft_uuid:
              (await lookupMinecraftUser(minecraftUsername))?.uuid ?? null,
          };

    const { error } = await supabase
      .from("minecraft_accounts")
      .upsert(upsertData, { onConflict: "user_id" });

    if (error) throw error;

    return {
      success: true,
      minecraft_username: upsertData.minecraft_username,
      minecraft_uuid: upsertData.minecraft_uuid,
    };
  },
});
