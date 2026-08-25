import { z } from "zod";
import { ROBLOX_THUMBNAIL_BATCH_MAX } from "@/lib/roblox";
import {
  GAME_USERNAME_MAX_LENGTH,
  SUPPORTED_GAME_FIGURES,
  normalizeGameUsername,
  type GameFigure,
} from "@/lib/constants/game-platforms";

/** Narrows a raw query-string token to a figure, straight off the tuple. */
function isSupportedGameFigure(value: string): value is GameFigure {
  return (SUPPORTED_GAME_FIGURES as readonly string[]).includes(value);
}

/**
 * The wire shapes of the Roblox lookup, shared by both ends: the route parses
 * its query with `verifyRobloxQuery` and validates what it sends back with
 * `robloxProfileResponse`, and the service parses the same response with the
 * same schema. Neither end restates the other's shape.
 */

/**
 * A Roblox username as it travels on the wire, or `null` to unlink.
 *
 * **There is no format rule here, and that is the decision rather than an
 * omission.** Roblox is the only authority on which handles exist on Roblox,
 * and its own signup validator arrived long after its accounts did — so real,
 * live handles carry characters that validator would refuse today, and a copy of
 * it here refused those accounts on Roblox's behalf and got it wrong. A name is
 * normalized, bounded at a length that is a statement about our own request, and
 * handed to the lookup; what comes back decides between verified and stored
 * unverified.
 *
 * The normalization is the shared one — invisible format characters stripped,
 * then trimmed — and it is the same category of rule as the bound: about the
 * request we make and the row we draw, never about what Roblox may have issued.
 *
 * A string that is empty after that is a clear, exactly as `null` is: there is no
 * name left in the field, and the spellings of that must not mean different
 * things depending on which surface sent them.
 *
 * Every surface that accepts a Roblox username imports this rather than
 * restating the bound.
 */
export const robloxUsernameValue = z
  .string()
  .transform(normalizeGameUsername)
  .pipe(
    z
      .string()
      .max(
        GAME_USERNAME_MAX_LENGTH,
        `Roblox username must be at most ${GAME_USERNAME_MAX_LENGTH} characters`,
      ),
  )
  .nullable()
  .transform((username) =>
    username === null || username === "" ? null : username,
  );

/** Request body of PATCH /api/roblox/account — link or unlink one's own. */
export const updateRobloxAccountBody = z.object({
  robloxUsername: robloxUsernameValue,
});

/**
 * Request body of the staff group-member Roblox edit — a gedu fixing the handle
 * of a child on their own roster, or (since 00205) an admin fixing it from the
 * group details page, which renders that same roster editor.
 *
 * The same value schema as the self-serve route, because it is the same edit
 * made by someone else. **What the server does with the name it parses out is
 * store it, unchanged.** It runs the Roblox lookup, but takes only the account
 * id from it: the spelling saved is the one that was sent, so the stored value
 * does not depend on when the lookup last ran — and the editor already adopted
 * the canonical casing before it committed, so what arrives is what the gedu
 * meant. A name Roblox resolves lands verified, with the id beside it; a name it
 * cannot resolve — including during a Roblox outage, which reads as "no answer"
 * rather than as an error — is saved all the same with a null id, which is an
 * unverified account and a success, not a failure.
 *
 * The gamer is named by the URL, not the body, so there is nothing here to aim
 * at another child.
 */
export const updateGroupMemberRobloxBody = z.object({
  robloxUsername: robloxUsernameValue,
});

/**
 * What the `set_group_member_roblox` RPC hands back. Generated as `Json`, so
 * this schema is the structure; the db tests parse real RPC output through it
 * in CI.
 *
 * The account id is a number where the Minecraft twin's is a string — Roblox's
 * key is an int64 `bigint`, Mojang's a dashed UUID in text — and it is null
 * whenever the username is, because an id with no name behind it is a verified
 * link to nothing.
 */
export const groupMemberRobloxResult = z.object({
  participant_id: z.string(),
  roblox_username: z.string().nullable(),
  roblox_user_id: z.number().int().positive().nullable(),
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

/**
 * Query string of GET /api/roblox/verify — the public Roblox lookup.
 *
 * The same reasoning as the value schema above, minus the unlink: there is
 * nothing to clear on a read, so a name that normalizes to nothing is a query
 * with no question in it and is refused. Everything else goes to Roblox.
 */
export const verifyRobloxQuery = z.object({
  username: z
    .string()
    .transform(normalizeGameUsername)
    .pipe(
      z
        .string()
        .min(1, "A username is required")
        .max(
          GAME_USERNAME_MAX_LENGTH,
          `Username must be at most ${GAME_USERNAME_MAX_LENGTH} characters`,
        ),
    ),
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

      // **Capped on what was SENT, before deduping.** Checking the deduped set
      // instead would let an arbitrarily long query string through as long as it
      // repeated itself — thousands of parts to split, trim and parse per
      // request, for a cap that is supposed to bound the work. The limit is a
      // statement about the request, so it is measured on the request.
      if (parts.length > ROBLOX_THUMBNAIL_BATCH_MAX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `At most ${ROBLOX_THUMBNAIL_BATCH_MAX} account ids per request`,
        });
        return z.NEVER;
      }

      const ids = new Set<number>();
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
        ids.add(value);
      }

      return [...ids];
    })
    .pipe(z.array(robloxUserIdValue)),

  /**
   * Which figures to resolve. **One upstream request each**, so this is the
   * knob that decides what the call costs against a rate limit the whole fleet
   * shares — which is why it defaults to the full figure alone rather than to
   * everything. A dense roster that draws headshots asks for `head`; a surface
   * drawing both asks for both and knowingly pays twice.
   */
  figures: z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined || raw.trim() === "") return ["full" as GameFigure];

      const parts = raw
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "");

      const figures = new Set<GameFigure>();
      for (const part of parts) {
        if (!isSupportedGameFigure(part)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `"${part}" is not a figure`,
          });
          return z.NEVER;
        }
        figures.add(part);
      }

      if (figures.size === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "figures must name at least one figure",
        });
        return z.NEVER;
      }

      return [...figures];
    })
    .pipe(z.array(z.enum(SUPPORTED_GAME_FIGURES))),
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

/**
 * What a batched lookup leaves behind: one figure's render URL per account,
 * keyed by the account id **as a string** — and the only form an answer may be
 * read in, **by the id the response names and never by position**. Reading
 * positionally would hand one child another child's face, which is the one
 * failure worse than no picture.
 *
 * Three values collapse to the same drawing, which is why this is `Partial` and
 * why the entries are nullable: an id with no entry has not been answered for
 * yet, an entry holding `null` is an account Roblox has no render for, and an
 * empty map is a lookup that has not landed (or that failed — renders are never
 * retried). All three draw the silhouette, in a figure box already at its final
 * size, so nothing moves when the pictures arrive.
 *
 * Read-only because every consumer reads: the surfaces that own a lookup build
 * their own record and hand it down, and a body that mutated the map it was
 * given would be writing into another component's state.
 */
export type RobloxRenderMap = Readonly<Partial<Record<string, string | null>>>;
