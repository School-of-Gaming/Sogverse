import type { ChatReactionCode } from "@/lib/constants/chat";
import type { UserRole } from "@/lib/constants/roles";

/**
 * The shapes every chat component takes — and the whole of what a surface has
 * to hand them.
 *
 * **Declared here structurally rather than imported from a service contract.**
 * There is no chat backend yet, and when there is, its row types will carry
 * columns a renderer has no business reading. These are the fields a bubble
 * actually draws; a container maps whatever it holds — fixtures today, an RLS
 * read tomorrow — onto them.
 */

/**
 * Which kind of account a message came from.
 *
 * The app's own role union rather than a parallel one: chat draws the same
 * four roles every other surface does, and a second spelling of them would be
 * a second thing to keep in step with the database enum for no gain.
 */
export type ChatRole = UserRole;

/**
 * Somebody who can appear in the log.
 *
 * The `id` is a real account UUID and is the identicon's seed, so a stand-in
 * string renders a degenerate avatar rather than a different one.
 */
export interface ChatAccount {
  id: string;
  /** First name, as every roster in the app shows it. */
  name: string;
  role: ChatRole;
}

/**
 * One stored image, at the size it was stored.
 *
 * **The URL is resolved by the container, not by the renderer.** A session photo
 * derives its object name from its row id through a shared helper; chat has no
 * bucket yet, so the honest presentational contract is a URL somebody else
 * produced. When the bucket lands, `src` is filled by that helper and nothing
 * here changes.
 *
 * `width` and `height` are the *stored* intrinsic dimensions and are the only
 * numbers a thumbnail's box is ever computed from — nothing measures a decoded
 * image, which is what keeps the log from reshuffling as JPEGs land.
 */
export interface ChatImageRef {
  id: string;
  src: string;
  width: number;
  height: number;
}

/** One person's one reaction. Unique per (message, sender, code). */
export interface ChatReactionEntry {
  code: ChatReactionCode;
  senderId: string;
}

/**
 * Where a message is in its round trip.
 *
 * The sender's own message echoes optimistically — it is on screen before the
 * server has seen it — so a bubble has three states and the retry affordance is
 * part of the design rather than an error screen bolted on afterwards.
 */
export type ChatDelivery = "sent" | "pending" | "failed";

/**
 * One message.
 *
 * **A message is text XOR one image**, never both: the composer stages images
 * and the send fans out, so an image gets its own row and the text (if any)
 * gets its own, back to back. That is what removes captions, an attachment
 * child table, and the question of what a caption on the third of five images
 * means.
 *
 * **Removal is a tombstone, never a deletion.** `hiddenAt` set is the whole of
 * it: the row stays, the reader's place is kept, and staff keep a copy for
 * review — which is the one moment the record matters most. Self-delete and a
 * moderator's removal leave the same mark, so nothing on screen tells a room
 * which of the two happened.
 */
export interface ChatMessage {
  id: string;
  senderId: string;
  /** ISO instant. Rendered in the *viewer's* zone, never the source's. */
  createdAt: string;
  /** Body markup, or `null` on an image-only message. */
  body: string | null;
  image: ChatImageRef | null;
  /** The message this one quotes, or `null`. */
  replyToId: string | null;
  /** ISO instant of the last edit, or `null` — drives the "edited" marker. */
  editedAt: string | null;
  /** ISO instant it was removed, or `null`. */
  hiddenAt: string | null;
  /** Who removed it — the sender themselves, or a moderator. */
  hiddenBy: string | null;
  reactions: readonly ChatReactionEntry[];
  delivery: ChatDelivery;
}
