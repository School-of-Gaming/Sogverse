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

/** Query string of GET /api/minecraft/verify — the public Mojang lookup. */
export const verifyMinecraftQuery = z.object({
  username: z.string().refine(isValidMinecraftUsername, {
    message:
      "Invalid username. Must be 3-16 characters: letters, numbers, underscores.",
  }),
});
