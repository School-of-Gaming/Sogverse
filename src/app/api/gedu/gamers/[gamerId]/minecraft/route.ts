import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { lookupMinecraftUser } from "@/lib/mojang";
import {
  groupMemberMinecraftResult,
  minecraftAccountWriteResult,
  updateGroupMemberMinecraftBody,
} from "@/services/minecraft/minecraft.contracts";

/**
 * PATCH /api/gedu/gamers/[gamerId]/minecraft — a gedu fixing the Minecraft
 * username of a child in a group they teach.
 *
 * It exists as a route rather than a bare RPC call for one reason: the Mojang
 * lookup has to happen on the server, exactly as it does for the self-serve
 * PATCH /api/minecraft/account. That is what makes a gedu's save land
 * *verified* — the canonical spelling Mojang returns and the UUID are stored
 * together — rather than leaving a pending name for someone else to confirm. A
 * name Mojang does not know still saves, with a null uuid, which is the same
 * answer the self-serve route gives.
 *
 * Authorization is NOT in this file, and deliberately so: the write goes
 * through `set_group_member_minecraft`, which re-derives the caller from
 * `auth.uid()` and refuses any gamer who is not actively participating in a
 * group that caller is assigned to. The gamer id here names the target; it
 * grants nothing, and a gedu aiming it at somebody else's child gets a 403 from
 * the database rather than from a check this route could forget to write.
 */
export const PATCH = defineRoute({
  posture: "role-gated",
  roles: "gedu",
  forbiddenMessage: "Only game educators can edit a group member's Minecraft username",
  params: z.object({ gamerId: z.string().uuid() }),
  body: updateGroupMemberMinecraftBody,
  response: minecraftAccountWriteResult,

  handler: async ({ supabase, params, body }) => {
    const { minecraftUsername } = body;

    // Clearing skips the lookup entirely — there is nothing to resolve, and
    // asking Mojang about an empty name is a round trip for no answer.
    const resolved =
      minecraftUsername === null
        ? null
        : await lookupMinecraftUser(minecraftUsername);

    const { data, error } = await supabase.rpc("set_group_member_minecraft", {
      p_gamer_id: params.gamerId,
      // The name Mojang gave back wins over the one that was typed: usernames
      // are case-preserving, and storing the canonical spelling is what makes
      // the roster row agree with the skin the client renders beside it.
      //
      // Empty string, not null, is how "clear it" travels — the generated RPC
      // argument types make every text parameter a non-null `string`, and the
      // function normalizes '' back to SQL NULL at the other end.
      p_minecraft_username: resolved?.username ?? minecraftUsername ?? "",
      p_minecraft_uuid: resolved?.uuid ?? "",
    });

    if (error) throw error;

    const written = groupMemberMinecraftResult.parse(data);

    return {
      success: true as const,
      minecraft_username: written.minecraft_username,
      minecraft_uuid: written.minecraft_uuid,
    };
  },
});
