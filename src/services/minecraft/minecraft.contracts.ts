import { z } from "zod";
import { isValidMinecraftUsername } from "@/lib/mojang";

/**
 * A Minecraft username as it travels on the wire, or `null` to unlink. The
 * format rule is the shared Mojang one, so a value that parses can be handed
 * straight to the lookup. Every route that accepts a Minecraft username imports
 * this rather than restating the character rules.
 */
export const minecraftUsernameValue = z
  .string()
  .refine(isValidMinecraftUsername, {
    message:
      "Invalid Minecraft username. Must be 3-16 characters: letters, numbers, underscores.",
  })
  .nullable();

/** Request body of PATCH /api/minecraft/account — link or unlink one's own. */
export const updateMinecraftAccountBody = z.object({
  minecraftUsername: minecraftUsernameValue,
});

/**
 * Request body of PATCH /api/gedu/gamers/[gamerId]/minecraft — a gedu fixing
 * the username of a child in their own group.
 *
 * The same value schema as the self-serve route, because it is the same edit
 * made by someone else: the server resolves the name against Mojang and stores
 * the canonical spelling with the UUID, so a gedu's save lands *verified*
 * rather than pending. The gamer is named by the URL, not the body, so there is
 * nothing here to aim at another child.
 */
export const updateGroupMemberMinecraftBody = z.object({
  minecraftUsername: minecraftUsernameValue,
});

/**
 * What the `set_group_member_minecraft` RPC hands back. Generated as `Json`,
 * so this schema is the structure; the db tests parse real RPC output through
 * it in CI.
 */
export const groupMemberMinecraftResult = z.object({
  participant_id: z.string(),
  minecraft_username: z.string().nullable(),
  minecraft_uuid: z.string().nullable(),
});

/** What both Minecraft write paths answer with. */
export const minecraftAccountWriteResult = z.object({
  success: z.literal(true),
  minecraft_username: z.string().nullable(),
  minecraft_uuid: z.string().nullable(),
});

/** Query string of GET /api/minecraft/verify — the public Mojang lookup. */
export const verifyMinecraftQuery = z.object({
  username: z.string().refine(isValidMinecraftUsername, {
    message:
      "Invalid username. Must be 3-16 characters: letters, numbers, underscores.",
  }),
});
