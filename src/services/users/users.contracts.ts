import { z } from "zod";
import { minecraftUsernameValue } from "@/services/minecraft/minecraft.contracts";
import { robloxUsernameValue } from "@/services/roblox/roblox.contracts";
import { Constants } from "@/types";
import type { Profile } from "@/types";
import type { GamePlatform } from "@/lib/constants/game-platforms";

/**
 * A profile as it comes back off `user_search_index`.
 *
 * **The view is where this schema earns its place.** PostgreSQL does not carry
 * a column's NOT NULL through a view, so the type generator — reading the
 * catalog faithfully — types every one of these columns as nullable, including
 * the eight `profiles` declares NOT NULL and that a LEFT JOIN cannot null
 * anyway (the join nulls its right-hand side, never the profile). Without this
 * the search would answer `(string | null)[]` where every caller wants
 * `Profile[]`, and the honest ways to bridge that are a cast, which lint
 * forbids and which would go stale in silence, or this.
 *
 * `satisfies z.ZodType<Profile>` is the half that does not rot: the schema is
 * checked against `Profile` — the *table's* row type, not the view's — so a
 * column added to `profiles` fails to compile here until it is given a rule.
 * Leaving it out of the view does not clear that: the check knows nothing about
 * which columns the view selects. The only other way out is for the search to
 * stop answering in `Profile`, which is a larger decision than adding a line.
 */
export const searchedProfile = z.object({
  id: z.string(),
  email: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  role: z.enum(Constants.public.Enums.user_role),
  phone: z.string().nullable(),
  currency: z.string().nullable(),
  home_location_id: z.string().nullable(),
  locale: z.string().nullable(),
  spoken_languages: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
}) satisfies z.ZodType<Profile>;

/**
 * The columns the search selects.
 *
 * `search_blob` is deliberately absent. It is the longest value on the row and
 * carries nothing the other columns do not, so selecting it would put every
 * searchable string about twenty people on the wire to be thrown away. Naming
 * the columns is also what keeps the schema above honest: `*` returns a wider
 * row, and a wider row parses against a narrower schema without complaint,
 * because zod strips what it does not know.
 *
 * **Spelled out as a literal rather than joined from the schema's keys**, even
 * though the joined form cannot drift. The Supabase client infers the response
 * shape *from this string*, so a value computed at runtime is just `string` to
 * the compiler and collapses that inference — which would leave the zod parse
 * below as the only thing standing between a mistyped column and production.
 * The drift the literal reintroduces is closed by a unit test asserting these
 * are exactly the schema's keys.
 */
export const SEARCHED_PROFILE_COLUMNS =
  "id,email,first_name,last_name,role,phone,currency,home_location_id,locale,spoken_languages,created_at,updated_at" as const;

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
