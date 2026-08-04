import { z } from "zod";
import { isValidRobloxUsername } from "@/lib/roblox";

/**
 * The wire shapes of the Roblox lookup, shared by both ends: the route parses
 * its query with `verifyRobloxQuery` and validates what it sends back with
 * `robloxProfileResponse`, and the service parses the same response with the
 * same schema. Neither end restates the other's shape.
 */

const INVALID_USERNAME_MESSAGE =
  "Invalid Roblox username. Must be 3-20 characters: letters, numbers, and at " +
  "most one underscore, not at either end.";

/**
 * A Roblox username as it travels on the wire, or `null` to unlink. The format
 * rule is the shared Roblox one, so a value that parses can be handed straight
 * to the lookup. Every surface that accepts a Roblox username imports this
 * rather than restating the character rules.
 */
export const robloxUsernameValue = z
  .string()
  .refine(isValidRobloxUsername, { message: INVALID_USERNAME_MESSAGE })
  .nullable();

/** Request body of PATCH /api/roblox/account — link or unlink one's own. */
export const updateRobloxAccountBody = z.object({
  robloxUsername: robloxUsernameValue,
});

/**
 * What the Roblox write path answers with.
 *
 * The account id is a number rather than a string, and that is the one place
 * this contract cannot mirror its Minecraft counterpart: Mojang's key is a
 * dashed UUID and Roblox's is an int64, and the column types follow suit. Null
 * when no lookup confirmed the account — presence is the whole of "verified".
 */
export const robloxAccountWriteResult = z.object({
  success: z.literal(true),
  roblox_username: z.string().nullable(),
  roblox_user_id: z.number().int().positive().nullable(),
});

/** Query string of GET /api/roblox/verify — the public Roblox lookup. */
export const verifyRobloxQuery = z.object({
  username: z
    .string()
    .refine(isValidRobloxUsername, { message: INVALID_USERNAME_MESSAGE }),
});

/**
 * Response body of GET /api/roblox/verify. One call answers both hops —
 * the account and its avatar — so the client never reaches the tightly
 * rate-limited thumbnail service itself.
 */
export const robloxProfileResponse = z.object({
  username: z.string(),
  userId: z.number().int().positive(),
  displayName: z.string(),
  /** The bust render, for the full figure. */
  avatarUrl: z.string().nullable(),
  /** The headshot render, for the compact figure. */
  headshotUrl: z.string().nullable(),
});

export type RobloxProfileResponse = z.infer<typeof robloxProfileResponse>;
