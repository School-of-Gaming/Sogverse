import { z } from "zod";
import { isValidRobloxUsername, ROBLOX_THUMBNAIL_BATCH_MAX } from "@/lib/roblox";

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

/** One account id as it appears on the wire — Roblox's key is a positive int64. */
const robloxUserIdValue = z.number().int().positive();

/**
 * Query string of GET /api/roblox/avatars — renders for accounts we already
 * hold the ids of.
 *
 * The ids arrive comma-delimited and are **transformed** into numbers here,
 * because a query string is always strings and the schema is the one place that
 * conversion should happen. Duplicates collapse: asking twice for one id is one
 * id to the upstream service, and letting it through would inflate a batch
 * against a shared budget for no answer.
 */
export const robloxAvatarsQuery = z.object({
  userIds: z
    .string()
    .transform((raw, ctx) => {
      const parts = raw
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "");

      if (parts.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "userIds must name at least one Roblox account id",
        });
        return z.NEVER;
      }

      const ids: number[] = [];
      for (const part of parts) {
        // `Number` rather than `parseInt`: parseInt("12abc") is 12, which would
        // quietly accept a malformed id and ask upstream about the wrong one.
        const value = Number(part);
        if (!Number.isSafeInteger(value) || value <= 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `"${part}" is not a Roblox account id`,
          });
          return z.NEVER;
        }
        if (!ids.includes(value)) ids.push(value);
      }

      if (ids.length > ROBLOX_THUMBNAIL_BATCH_MAX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `At most ${ROBLOX_THUMBNAIL_BATCH_MAX} account ids per request`,
        });
        return z.NEVER;
      }

      return ids;
    })
    .pipe(z.array(robloxUserIdValue)),
});

/**
 * Response body of GET /api/roblox/avatars.
 *
 * **Keyed by account id, and it answers for every id it was asked about** —
 * including the ones Roblox had no picture for, which come back with both
 * renders `null`. A caller can therefore tell "we asked and there is none" from
 * "we never asked", which is the difference between drawing the silhouette and
 * leaving a box waiting for something that is not coming.
 *
 * A record rather than an array so a row can look its own id up directly; the
 * key is the id as a string, because that is what JSON object keys are.
 */
export const robloxAvatarsResponse = z.object({
  renders: z.record(
    z.string(),
    z.object({
      avatarUrl: z.string().nullable(),
      headshotUrl: z.string().nullable(),
    }),
  ),
});

export type RobloxAvatarsResponse = z.infer<typeof robloxAvatarsResponse>;

/** Both renders of one account, as a surface consumes them. */
export type RobloxRenderUrls = RobloxAvatarsResponse["renders"][string];
