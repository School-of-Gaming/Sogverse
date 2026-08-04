import { z } from "zod";
import { minecraftUsernameValue } from "@/services/minecraft/minecraft.contracts";
import { robloxUsernameValue } from "@/services/roblox/roblox.contracts";

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
export const adminGameAccountBody = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("minecraft"),
    username: minecraftUsernameValue,
  }),
  z.object({
    platform: z.literal("roblox"),
    username: robloxUsernameValue,
  }),
]);

export type AdminGameAccountBody = z.infer<typeof adminGameAccountBody>;

/**
 * What the write answers with — also a discriminated union, and for a reason
 * worth keeping: the account key is a dashed Mojang UUID on one platform and an
 * int64 on the other, and collapsing them into `string | number` here would be
 * the first place the two key spaces got quietly treated as one. Nothing reads
 * the value; its presence is the whole of "verified".
 */
export const adminGameAccountWriteResult = z.discriminatedUnion("platform", [
  z.object({
    success: z.literal(true),
    platform: z.literal("minecraft"),
    username: z.string().nullable(),
    externalId: z.string().nullable(),
  }),
  z.object({
    success: z.literal(true),
    platform: z.literal("roblox"),
    username: z.string().nullable(),
    externalId: z.number().int().positive().nullable(),
  }),
]);

export type AdminGameAccountWriteResult = z.infer<
  typeof adminGameAccountWriteResult
>;
