import { z } from "zod";
import { Constants } from "@/types";
import { CHAT_REACTION_CODES } from "@/lib/constants/chat";

/**
 * Wire contracts for the chat RPCs (00228 / 00229).
 *
 * Two jobs, and they are the same job seen from each end: the schemas here are
 * what a service method parses an `.rpc()` result through, and what the db
 * tests parse REAL RPC output through in CI — so Postgres and TypeScript
 * cannot drift apart quietly. A changed column fails the parse loudly instead
 * of arriving as `undefined` three components later.
 *
 * **Only the shapes that need one.** Most of this surface returns a scalar the
 * generator already types correctly — a `timestamptz` from each of the four
 * writers, a boolean from the reaction toggle, `void` from the restore and the
 * lock — and a schema over a bare string would restate the signature without
 * checking anything. What earns a schema is a row shape: the channel the ensure
 * RPC materializes, and the roster it hands the mention picker.
 *
 * **The reaction code derives from `CHAT_REACTION_CODES`, deliberately NOT from
 * the generated `Constants`.** There is no `chat_reaction_code` enum in the
 * database — the approved set is a CHECK constraint mirroring that constant, so
 * that constant is the source and codegen has nothing to offer here. Changing
 * the set is the tuple in `src/lib/constants/chat.ts`, the matching
 * `chat.reactions.*` label in every locale, and one migration altering the
 * CHECK; this schema follows the first of those three for free.
 */

// ---------------------------------------------------------------------------
// The one named refusal
// ---------------------------------------------------------------------------

/**
 * The SQLSTATE every chat write raises when a moderator has locked the caller.
 *
 * **The client has to tell this refusal apart from every other one, and it is
 * the only one that earns a code.** A send refused by a lock must not offer a
 * retry: the lock's own realtime arrival is what disables the composer, and the
 * refusal races it — so "that did not work, try again" would be a button that
 * cannot ever work. Every other refusal on this surface is generic and lands on
 * the components' existing failed-bubble-plus-retry, because the UI is driven
 * by `src/components/chat/capabilities.ts` and cannot produce them; a named code
 * for those would buy a branch nobody can see. `42501` stays the authorization
 * guard's alone.
 *
 * Raised by `send_chat_message`, `send_chat_image_message`, `edit_chat_message`
 * and `toggle_chat_reaction` — and deliberately NOT by `hide_chat_message`,
 * because taking back your own message is the one write a lock leaves.
 */
export const CHAT_LOCKED_SQLSTATE = "P0024";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** An approved reaction code, as the `chat_reactions.code` CHECK spells it. */
export const chatReactionCode = z.enum(CHAT_REACTION_CODES);

// ---------------------------------------------------------------------------
// ensure_chat_channel
// ---------------------------------------------------------------------------

/**
 * One `chat_channels` row.
 *
 * Both window instants are **server-derived and snapshotted** — the RPC reads
 * the product's schedule and never accepts a caller's value, because they feed
 * the family read bound. A client reads them; it never sends them.
 */
export const chatChannelRow = z.object({
  id: z.string(),
  type: z.enum(Constants.public.Enums.chat_channel_type),
  group_id: z.string(),
  session_opens_at: z.string(),
  session_ends_at: z.string(),
  created_at: z.string(),
});

/**
 * What `ensure_chat_channel` answers with.
 *
 * `RETURNS SETOF public.chat_channels`, so PostgREST hands back an array — and
 * it always holds exactly one row: the function either materializes the current
 * window's channel and returns it, or raises (`42501` for a non-member, `P0002`
 * when no session window is open). `.length(1)` is what makes "always exactly
 * one" a checked claim rather than a comment, so a caller taking `[0]` is not
 * quietly reading `undefined` the day that stops being true.
 */
export const ensureChatChannelResult = z.array(chatChannelRow).length(1);

// ---------------------------------------------------------------------------
// get_chat_channel_roster
// ---------------------------------------------------------------------------

/**
 * One person the channel can name: id, first name, role.
 *
 * Nothing else about anybody — this RPC exists because `profiles` RLS correctly
 * refuses cross-participant reads, so it is a deliberate hole in that refusal
 * and is kept to the smallest shape the surface needs. The id seeds the
 * identicon and keys a mention; the first name is what a bubble draws; the role
 * is what `capabilities.ts` derives moderation from.
 */
export const chatRosterEntry = z.object({
  id: z.string(),
  first_name: z.string(),
  role: z.enum(Constants.public.Enums.user_role),
});

/**
 * The channel roster, **in the order the RPC returned it**.
 *
 * The order is load-bearing and this schema deliberately preserves it rather
 * than sorting: mention resolution settles two accounts sharing a name by list
 * position, and the composer and the in-place editor are handed the same array.
 * A consumer that re-sorted would let one typed `@Name` mean different people in
 * different fields. The RPC orders by profile id — arbitrary but stable, which
 * is the whole requirement.
 */
export const chatChannelRoster = z.array(chatRosterEntry);

// ---------------------------------------------------------------------------
// Compile-time shapes
// ---------------------------------------------------------------------------

/**
 * Derived from the schemas above so the wire contract and the type cannot
 * drift.
 */
export type ChatChannelRow = z.infer<typeof chatChannelRow>;
export type ChatRosterEntry = z.infer<typeof chatRosterEntry>;
export type ChatChannelRoster = z.infer<typeof chatChannelRoster>;
