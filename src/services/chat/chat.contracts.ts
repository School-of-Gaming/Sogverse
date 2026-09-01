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

/**
 * Whether a rejected write was refused by a lock.
 *
 * Lives beside the code rather than in the service, because it is the same wire
 * fact seen from the caller's side: PostgREST hands the SQLSTATE back on the
 * error object's `code` field, and every client that has to tell this refusal
 * apart asks the question exactly once, here.
 *
 * A thrown value is `unknown` at the boundary, so the guard narrows rather than
 * asserting — a network failure and a Postgres refusal both arrive as
 * exceptions, and only one of them carries a code.
 */
export function isChatLockedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === CHAT_LOCKED_SQLSTATE
  );
}

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
// Images
// ---------------------------------------------------------------------------

/**
 * The private bucket a chat image's bytes live in.
 *
 * **The object's name is the message row's id**, with no extension — the
 * session-images "the primary key IS the object name" pattern, minus the
 * suffix, because a private object is served through the read route below,
 * which carries its own content type; nothing reads the name for one. So there
 * is no path column and no name helper: the id a caller already holds is the
 * object.
 *
 * Private, and read only through `GET /api/chat/images/[id]`, which downloads
 * the object ON THE VIEWER'S OWN SESSION — so the bucket's one SELECT policy
 * (00231) stays the whole read boundary for the bytes: membership, the family
 * time bound and the hidden state all ride on it, answered afresh on every
 * fetch. No signed URLs are minted anywhere (owner decision, 2026-09-01,
 * recorded in 00233): a signed URL is a bearer token any viewer could copy out
 * of devtools and share for its whole lifetime, and on a surface children use
 * that was a standing edge worth removing rather than accepting.
 */
export const CHAT_IMAGES_BUCKET = "chat-images";

/**
 * The app path a stored chat image is fetched from — the one spelling of the
 * read route's address, shared by the container that renders it, the route
 * that would link to itself, and the tests that call the handler.
 *
 * A pure function of the message id, derivable with no async step and no
 * state: the route authorizes per fetch on the viewer's session cookies, so
 * unlike a signed URL this path never expires, never rotates, and is useless
 * to anybody who is not signed in as a channel member.
 */
export function chatImagePath(messageId: string): string {
  return `/api/chat/images/${messageId}`;
}

/**
 * The non-file half of `POST /api/chat/images`'s multipart form.
 *
 * **The message id travels from the client**, exactly as it does for a text
 * send: the optimistic echo is already on screen under that id, and the row has
 * to reconcile to it by identity. The route hands it straight to the send RPC,
 * where the primary key is what refuses a collision.
 *
 * **The dimensions do not travel at all**, and their absence is the point: the
 * route measures them from its own re-encode, so a client-claimed pair never
 * reaches the columns. There is no field here for one to arrive in.
 *
 * `replyToMessageId` is load-bearing rather than symmetric — a burst with no
 * text puts the reply on the FIRST picture, so an image send genuinely can be a
 * reply. A form carries no nulls, so its absence is how "no reply" is spelled.
 */
export const chatImageUploadFields = z.object({
  id: z.string().uuid(),
  channelId: z.string().uuid(),
  replyToMessageId: z.string().uuid().optional(),
});

export type ChatImageUploadFields = z.infer<typeof chatImageUploadFields>;

/**
 * What the upload answers: the id it stored under, the server's own
 * `created_at`, the dimensions it measured, and the `image_stored_at` stamp.
 *
 * The created stamp is there for the reason the text send's is — it is a field
 * the echo could not know, so the cache can be brought to server truth exactly
 * rather than by refetching two hundred rows to learn one. The **dimensions**
 * are here for the same reason one step further out: they are the numbers the
 * row actually holds, and a burst of six pictures that had to invalidate the
 * history to learn them would be six refetches of the whole log.
 *
 * **`imageStoredAt` is non-optional because a 200 from this route MEANS the
 * flag committed** — row, object, then `mark_chat_image_stored`, and a failure
 * of any of the three is the compensated 500, never a success with a hole in
 * it. The sender's cache write copies it onto the settled row so the sender's
 * own cache never holds a NULL-flag row for a picture that sent.
 */
export const chatImageUploadResponse = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  imageStoredAt: z.string(),
});

export type ChatImageUploadResponse = z.infer<typeof chatImageUploadResponse>;

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
