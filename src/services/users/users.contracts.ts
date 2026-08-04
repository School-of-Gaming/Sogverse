import { z } from "zod";
import { minecraftUsernameValue } from "@/services/minecraft/minecraft.contracts";
import { robloxUsernameValue } from "@/services/roblox/roblox.contracts";
import type { GamePlatform } from "@/lib/constants/game-platforms";

/**
 * Wire shapes for the admin's edit of somebody else's game identity
 * (`PATCH /api/admin/users/[id]/game-account`).
 *
 * **A discriminated union rather than a platform string beside a loose
 * username**, because the format rule is the one thing that genuinely differs
 * per platform — Mojang allows underscores freely, Roblox allows at most one and
 * never at an end — and a union is what keeps each rule attached to its own
 * platform instead of leaving the route to remember which check to run. Both
 * halves import the same value schemas the self-serve routes use, so an admin's
 * edit cannot accept a name a person could not have typed themselves.
 *
 * `null` unlinks, exactly as it does on every other write path.
 */

/**
 * A platform literal that is checked against the supported list.
 *
 * `z.literal("minecraft")` on its own is just a string: rename a platform and
 * the schema goes on happily describing one that no longer exists. Constraining
 * the argument makes the literal a claim the compiler checks.
 */
function gamePlatformLiteral<P extends GamePlatform>(platform: P) {
  return z.literal(platform);
}

/**
 * **The completeness half, and the reason these two records exist at all.**
 *
 * A discriminated union has to be written branch by branch — the branches have
 * genuinely different schemas, so no amount of mapping over the tuple produces
 * one. What a mapped union would have bought is the guarantee that *every*
 * platform has a branch, and `satisfies Record<GamePlatform, …>` buys exactly
 * that instead: adding a platform to `SUPPORTED_GAME_PLATFORMS` fails to compile
 * here until it is given a username rule and an account-key type, which are
 * precisely the two decisions a new platform owes this file.
 */
const USERNAME_BY_PLATFORM = {
  minecraft: minecraftUsernameValue,
  roblox: robloxUsernameValue,
} satisfies Record<GamePlatform, z.ZodType<string | null>>;

/**
 * The account key's type, per platform. A dashed Mojang UUID on one and an int64
 * on the other — never collapsed into `string | number`, because that would be
 * the first place the two key spaces got quietly treated as one. Nothing reads
 * the value; its presence is the whole of "verified".
 */
const EXTERNAL_ID_BY_PLATFORM = {
  minecraft: z.string().nullable(),
  roblox: z.number().int().positive().nullable(),
} satisfies Record<GamePlatform, z.ZodType<string | number | null>>;

export const adminGameAccountBody = z.discriminatedUnion("platform", [
  z.object({
    platform: gamePlatformLiteral("minecraft"),
    username: USERNAME_BY_PLATFORM.minecraft,
  }),
  z.object({
    platform: gamePlatformLiteral("roblox"),
    username: USERNAME_BY_PLATFORM.roblox,
  }),
]);

export type AdminGameAccountBody = z.infer<typeof adminGameAccountBody>;

/** What the write answers with — the same union, one field further on. */
export const adminGameAccountWriteResult = z.discriminatedUnion("platform", [
  z.object({
    success: z.literal(true),
    platform: gamePlatformLiteral("minecraft"),
    username: z.string().nullable(),
    externalId: EXTERNAL_ID_BY_PLATFORM.minecraft,
  }),
  z.object({
    success: z.literal(true),
    platform: gamePlatformLiteral("roblox"),
    username: z.string().nullable(),
    externalId: EXTERNAL_ID_BY_PLATFORM.roblox,
  }),
]);

export type AdminGameAccountWriteResult = z.infer<
  typeof adminGameAccountWriteResult
>;
