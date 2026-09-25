import { z } from "zod";
import { minecraftUsernameValue } from "@/services/minecraft/minecraft.contracts";
import { robloxUsernameValue } from "@/services/roblox/roblox.contracts";
import { Constants } from "@/types";
import type { Profile } from "@/types";
import type { GamePlatform } from "@/lib/constants/game-platforms";

/**
 * The `profiles` columns a `user_list_entries` row carries, with the NOT NULLs
 * put back.
 *
 * **The view is where this schema earns its place.** PostgreSQL does not carry
 * a column's NOT NULL through a view, so the type generator — reading the
 * catalog faithfully — types every one of these columns as nullable, including
 * the eight `profiles` declares NOT NULL and that nothing in the view's
 * predicate can null. Without this the list would answer `(string | null)[]`
 * where every surface wants a person, and the honest ways to bridge that are a
 * cast, which lint forbids and which would go stale in silence, or this.
 *
 * `satisfies z.ZodType<Profile>` below is the half that does not rot: the shape
 * is checked against `Profile` — the *table's* row type, not the view's — so a
 * column added to `profiles` fails to compile here until it is given a rule.
 * Leaving it out of the view does not clear that: the check knows nothing about
 * which columns the view selects. The only other way out is for the list to
 * stop answering in the table's own row type, which is a larger decision than
 * adding a line.
 */
const userListProfileColumns = {
  id: z.string(),
  email: z.string(),
  email_verified_at: z.string().nullable(),
  first_name: z.string(),
  last_name: z.string(),
  role: z.enum(Constants.public.Enums.user_role),
  phone: z.string().nullable(),
  currency: z.string().nullable(),
  home_location_id: z.string().nullable(),
  utm_source: z.string().nullable(),
  utm_medium: z.string().nullable(),
  utm_campaign: z.string().nullable(),
  locale: z.string().nullable(),
  registration_completed_at: z.string().nullable(),
  spoken_languages: z.array(z.enum(Constants.public.Enums.spoken_language)),
  created_at: z.string(),
  updated_at: z.string(),
};

/** The profile half alone, carrying the check the doc above describes. */
const userListProfile = z.object(
  userListProfileColumns,
) satisfies z.ZodType<Profile>;

/**
 * One child riding inside its family's row.
 *
 * **The column is `jsonb`, so the generated type is `Json` and the compiler can
 * say nothing at all about what is inside it** — not even that it is an array.
 * This schema is the whole of that knowledge, which is why it is shared rather
 * than restated per surface: the two list surfaces and the DB test that parses
 * real view output all have to mean the same thing by "a linked gamer", and the
 * test parsing the database's own rows through this very schema is what proves
 * the shape describes the view rather than what somebody assumed it holds.
 *
 * Every field is one a list row renders or gates on, `sign_in` included —
 * the fact whose per-gamer lookup used to be thirty sequential keyed batches on
 * the end of the old whole-table read. It is nullable because the extension row
 * is a LEFT JOIN: a profile with the gamer role but no `gamer_profiles` row
 * contributes null rather than dropping the child from the family.
 */
export const userListGamer = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string(),
  email_verified_at: z.string().nullable(),
  role: z.enum(Constants.public.Enums.user_role),
  created_at: z.string(),
  sign_in: z.enum(Constants.public.Enums.gamer_sign_in).nullable(),
});

export type UserListGamer = z.infer<typeof userListGamer>;

/**
 * One row of `user_list_entries`: a top-level list entry and its whole family.
 *
 * The two gedu standing flags are booleans rather than three-state, because the
 * view coalesces a missing `gedu_profiles` row to `false` — `role` is the
 * discriminator for whether either value means anything, and it is on the row
 * already. That is what retires the "we could not find out" state the surfaces
 * used to carry: a certification flag that rides along with the row it is about
 * cannot be missing while the row is present.
 */
export const userListEntry = userListProfile.extend({
  certified: z.boolean(),
  criminal_record_check_passed: z.boolean(),
  linked_gamers: z.array(userListGamer),
});

export type UserListEntry = z.infer<typeof userListEntry>;

/**
 * The columns a page of the list selects.
 *
 * `family_search_blob` is deliberately absent. It is the longest value on the
 * row — every searchable string of a whole family — and carries nothing a
 * surface renders, so selecting it would put all of it on the wire to be thrown
 * away. The filter reads it server-side, which is the only place it is needed.
 * Naming the columns is also what keeps the schema above honest: `*` returns a
 * wider row, and a wider row parses against a narrower schema without
 * complaint, because zod strips what it does not know.
 *
 * **Spelled out as a literal rather than joined from the schema's keys**, even
 * though the joined form cannot drift. The Supabase client infers the response
 * shape *from this string*, so a value computed at runtime is just `string` to
 * the compiler and collapses that inference — which would leave the zod parse
 * as the only thing standing between a mistyped column and production. The
 * drift the literal reintroduces is closed by a unit test asserting these are
 * exactly the schema's keys, in order.
 */
export const USER_LIST_ENTRY_COLUMNS =
  "id,email,email_verified_at,first_name,last_name,role,phone,currency,home_location_id,utm_source,utm_medium,utm_campaign,locale,registration_completed_at,spoken_languages,created_at,updated_at,certified,criminal_record_check_passed,linked_gamers" as const;

/**
 * How much has to be typed before the box is searching rather than listing.
 *
 * Below it the needle is ignored entirely and the surface shows the newest
 * page, which is what it was already showing — so a first keystroke costs no
 * request and asserts nothing. It is not a performance floor: the filter is an
 * unanchored `ILIKE` over a derived blob, so a one-character needle is a scan
 * that matches nearly everybody, and "the newest 25 of nearly everybody" is the
 * unfiltered page dressed up as an answer to a question nobody finished asking.
 */
export const USER_LIST_SEARCH_MIN_QUERY = 2;

/**
 * Wire shapes for the admin's edit of somebody else's game identity
 * (`PATCH /api/admin/users/[id]/game-account`).
 *
 * **A discriminated union rather than a platform string beside a loose
 * username**, because the account key genuinely differs per platform — a dashed
 * Mojang UUID on one and an int64 on the other — and a union is what keeps each
 * platform's own shape attached to it instead of leaving the route to remember
 * which one it is answering about. Both halves import the same value schemas the
 * self-serve routes use, so an admin's edit travels under exactly the rules a
 * person's own edit does.
 *
 * **Neither half carries a format rule, on purpose.** The platform is the only
 * authority on which of its names exist, so what an admin types is trimmed,
 * length-bounded and sent — and the lookup's answer decides between a stored key
 * and an unverified name, here as everywhere else.
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
 * here until it is given a wire value and an account-key type, which are
 * precisely the two decisions a new platform owes this file. The two wire values
 * happen to read alike today — a trim and a length bound is all either platform
 * asks of us — and each still names its own, because the platform that changes
 * its mind should change one line rather than share one.
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
