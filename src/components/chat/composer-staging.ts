import {
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_STAGED_CHAT_IMAGES,
} from "@/lib/constants/chat";
import { resolveChatMentions } from "./chat-body";
import type { ChatAccount } from "./types";

/**
 * The composer's staging queue, and what a send makes of it.
 *
 * **The composer stages and the send fans out.** Paste, drag-and-drop and the
 * file picker all put images in one queue; pressing Send turns that queue into
 * one image-only message per picture plus — if anything was typed — one text
 * message, back to back. That is what makes a message text XOR one image, which
 * in turn is what removes captions, an attachment child table, and the question
 * of what a caption on the third of five pictures is supposed to mean.
 *
 * Both halves are pure, because both are decisions rather than effects: which
 * files the queue accepts, and what the queue becomes. The component around
 * them owns the object URLs, the decode and the network.
 */

/** One picture waiting in the composer. */
export interface StagedChatImage {
  /** Stable for the life of the staging entry — the React key and the ✕ target. */
  key: string;
  /** A URL the browser can already draw: an object URL, or fixture art. */
  src: string;
  /**
   * The normalized JPEG — the bytes the send uploads, and the bytes `src` is an
   * object URL of.
   *
   * Held rather than re-derived from the file at send time, because they are
   * the same artifact the thumbnail is already drawing: encoding twice would
   * give the sender a preview of one picture and the room another.
   */
  file: Blob;
  /**
   * The ENCODED dimensions, read once when the picture was staged.
   *
   * Measuring here is the pipeline doing its job — the pass that normalizes and
   * re-encodes the bytes learns the size on the way — and every box from this
   * point on is arithmetic off these two numbers. What is forbidden is
   * measuring at render time. (What the *row* eventually stores is the server's
   * own measurement of the same bytes; these are what the composer and the
   * optimistic echo draw with until it answers.)
   */
  width: number;
  height: number;
  /** The file's own name, for the remove control's accessible label. */
  name: string;
}

/** What a staging attempt did. */
export interface ChatStagingResult {
  /** The queue afterwards, capped. */
  staged: StagedChatImage[];
  /** How many of `incoming` did not fit. Zero on the ordinary path. */
  refused: number;
}

/**
 * Adds pictures to the queue, up to the cap.
 *
 * **The overflow is refused, not truncated silently.** A drop of ten pictures
 * onto a queue with room for two takes two and says so — the count is what the
 * composer's one refusal line is written from. Taking ten and quietly sending
 * two would be the same gesture with no way to notice.
 */
export function stageChatImages(
  current: readonly StagedChatImage[],
  incoming: readonly StagedChatImage[],
  cap: number = MAX_STAGED_CHAT_IMAGES,
): ChatStagingResult {
  const room = Math.max(0, cap - current.length);
  const accepted = incoming.slice(0, room);
  return {
    staged: [...current, ...accepted],
    refused: incoming.length - accepted.length,
  };
}

/** One message the send is about to make. */
export interface ChatSendDraft {
  body: string | null;
  image: StagedChatImage | null;
  /** The message this draft answers, or `null`. */
  replyToId: string | null;
}

/**
 * What one press of Send becomes.
 *
 * **Pictures first, then the words.** A burst read top to bottom is the set and
 * then whatever the sender wanted to say about it, which is how the same
 * gesture reads in every chat anybody already uses. An empty draft with an empty
 * queue produces nothing at all, which is what makes "Send does nothing when
 * there is nothing to send" a property rather than a guard at the call site.
 *
 * **This function takes the *display* text and does the mention resolution
 * itself, in that order, because the order is the whole correctness argument.**
 * The cap is a promise about the sentence somebody wrote — so it is measured on
 * `@Name`, before a mention becomes `@[Name](uuid)` — and the stored body it
 * produces is therefore allowed to run longer than `maxLength`. A caller that
 * resolved first and handed the token form in would get the cap applied to the
 * markup: a draft at the limit naming somebody would lose its tail, possibly
 * mid-token, leaving `@[Väinö](789a4f…` sitting in the log as literal text. The
 * seam is closed by construction rather than by convention — there is no
 * argument spelling for "already resolved, do not cap", because that is the
 * mistake this signature exists to make unavailable. (See
 * `MAX_CHAT_MESSAGE_LENGTH`'s own header for the wire-side half of the same
 * contract.)
 *
 * **One reply target per burst, on exactly one draft.** The composer answers one
 * message, so quoting it on every picture would draw the same quote five times
 * over one set. It rides on the words when there are any — that is the half of
 * the burst that is actually answering — and on the first picture when there are
 * none, because an image-only reply that dropped its quote would send a reply
 * that is no longer a reply to anything.
 */
export function fanOutChatSend(
  /** What the writer typed, in the display form they can see: `@Name`. */
  text: string,
  staged: readonly StagedChatImage[],
  /**
   * Everyone mentionable, in the order the surface listed them — the order is
   * what settles a duplicate name (`resolveChatMentions` states the tolerance).
   * Pass `[]` for a surface with no roster; the words then travel untouched.
   */
  accounts: readonly ChatAccount[],
  replyToId: string | null = null,
  /** The cap on the *composed* text, applied before resolution. */
  maxLength: number = MAX_CHAT_MESSAGE_LENGTH,
): ChatSendDraft[] {
  const composed = text.trim().slice(0, maxLength);
  const body = resolveChatMentions(composed, accounts);
  const drafts: ChatSendDraft[] = staged.map((image) => ({
    body: null,
    image,
    replyToId: null,
  }));
  if (body.length > 0) drafts.push({ body, image: null, replyToId });
  else if (drafts.length > 0) drafts[0] = { ...drafts[0], replyToId };
  return drafts;
}

/** Whether Send has anything to do. Drives the button's disabled state. */
export function chatSendIsEmpty(
  text: string,
  staged: readonly StagedChatImage[],
): boolean {
  return text.trim().length === 0 && staged.length === 0;
}
