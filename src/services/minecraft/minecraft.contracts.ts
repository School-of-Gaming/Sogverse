import { z } from "zod";
import {
  GAME_USERNAME_MAX_LENGTH,
  normalizeGameUsername,
} from "@/lib/constants/game-platforms";

/**
 * A Minecraft username as it travels on the wire, or `null` to unlink.
 *
 * **There is no format rule here, and that is the decision rather than an
 * omission.** Mojang is the only authority on which Minecraft names exist, and
 * accounts issued before its modern rules break every regex we could write —
 * so a name is normalized, bounded at a length that is a statement about our own
 * request, and handed to the lookup. What comes back decides: an account
 * resolves and the name lands verified, nothing resolves and the same name is
 * stored unverified with the "couldn't find" sentence beside it.
 *
 * The normalization is the shared one — invisible format characters stripped,
 * then trimmed — and it is the same category of rule as the bound: about the
 * request we make and the row we draw, never about what Mojang may have issued.
 *
 * A string that is empty after that is a clear, exactly as `null` is: there is
 * no name left in the field, and the spellings of that must not mean different
 * things depending on which surface sent them.
 *
 * Every route that accepts a Minecraft username imports this rather than
 * restating the bound.
 */
export const minecraftUsernameValue = z
  .string()
  .transform(normalizeGameUsername)
  .pipe(
    z
      .string()
      .max(
        GAME_USERNAME_MAX_LENGTH,
        `Minecraft username must be at most ${GAME_USERNAME_MAX_LENGTH} characters`,
      ),
  )
  .nullable()
  .transform((username) =>
    username === null || username === "" ? null : username,
  );

/** Request body of PATCH /api/minecraft/account — link or unlink one's own. */
export const updateMinecraftAccountBody = z.object({
  minecraftUsername: minecraftUsernameValue,
});

/**
 * Request body of PATCH /api/gedu/gamers/[gamerId]/minecraft — a gedu fixing
 * the username of a child in their own group, or (since 00205) an admin fixing
 * it from the group details page, which renders that same roster editor.
 *
 * The same value schema as the self-serve route, because it is the same edit
 * made by someone else: the server resolves the name against Mojang and stores
 * the canonical spelling with the UUID, so a staff save lands *verified*
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

/**
 * Query string of GET /api/minecraft/verify — the public Mojang lookup.
 *
 * The same reasoning as the value schema above, minus the unlink: there is
 * nothing to clear on a read, so a name that normalizes to nothing is a query
 * with no question in it and is refused. Everything else goes to Mojang.
 */
export const verifyMinecraftQuery = z.object({
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
