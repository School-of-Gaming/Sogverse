/**
 * The chat vocabulary that is code rather than copy.
 *
 * **The approved reaction set lives here and nowhere else.** Reactions are a
 * small fixed vocabulary rather than a full emoji picker — a bounded set is the
 * right shape for a product full of children, and it is what let the emoji-picker
 * library purchase be dropped. Keeping it in a constants module is also what
 * makes the owner's final pick a code edit inside this surface rather than a
 * follow-up feature: change the tuple, add the matching `chat.reactions.*` label
 * in every locale, done.
 *
 * **The glyphs live here because `messages/` may not hold emoji** (untranslatable,
 * unthemeable copy). A reaction's *name* is a translated string keyed by its
 * code; the character it draws is this module's business. When the wire-up
 * lands, the DB stores the code and CHECK-constrains it against this same list,
 * so the raw emoji never reaches a column.
 */

/**
 * The approved reaction codes, in the order the picker draws them.
 *
 * Provisional: this is the set the design is reviewed against, and the owner
 * tunes it in the preview scene. Six, because a row of them has to fit inside a
 * bubble's width at the 360 px floor without wrapping into a grid.
 */
export const CHAT_REACTION_CODES = [
  "thumbs_up",
  "heart",
  "laugh",
  "surprised",
  "celebrate",
  "thinking",
] as const;

export type ChatReactionCode = (typeof CHAT_REACTION_CODES)[number];

/** The character each code draws. Never stored; never translated. */
export const CHAT_REACTION_GLYPHS: Record<ChatReactionCode, string> = {
  thumbs_up: "👍",
  heart: "❤️",
  laugh: "😄",
  surprised: "😮",
  celebrate: "🎉",
  thinking: "🤔",
};

/** Narrows an arbitrary string to a code this build knows how to draw. */
export function isChatReactionCode(value: string): value is ChatReactionCode {
  return (CHAT_REACTION_CODES as readonly string[]).includes(value);
}

/**
 * The character cap on one message's **composed** text — what the writer sees
 * and typed, mentions included as the `@Name` they read.
 *
 * Inherited from the app-message chat this replaces: 500 characters is a
 * paragraph, and a chat log is not where anybody writes an essay. Counting the
 * composed form is the only honest place to count it: a cap has to be a
 * promise about the sentence somebody is writing, and a writer cannot be asked
 * to budget for markup the composer never shows them.
 *
 * **The stored body can therefore be longer than this.** A mention leaves the
 * composer as `@Name` and reaches the wire as `@[Name](uuid)` — about forty
 * characters more, each — so a 500-character draft naming three people stores
 * roughly 620. The send RPC has to account for that, and there are only two
 * honest ways: count the *display* length server-side (flatten the tokens back
 * and measure that), or cap the stored column high enough that no legal draft
 * can exceed it. What it must not do is apply this number to the stored string,
 * which would refuse sentences the composer said were fine — with the cap
 * biting hardest on exactly the messages that name the most people.
 */
export const MAX_CHAT_MESSAGE_LENGTH = 500;

/**
 * How many images one send may stage.
 *
 * The send fans out — each staged image becomes its own image-only message —
 * so this is a cap on the burst, not on the log. Six keeps a wrapping
 * thumbnail row to two lines at the narrow breakpoint.
 */
export const MAX_STAGED_CHAT_IMAGES = 6;

/**
 * The image limits, borrowed rather than chosen: **one set of image limits
 * platform-wide.**
 *
 * A chat picture and a session-report photo are the same kind of artifact
 * meeting the same pipeline — the browser decodes, downscales and re-encodes,
 * the route verifies the bytes and re-encodes them again server-side — so a
 * second set of numbers here could only ever drift into disagreeing with the
 * first about what an image is allowed to be. The session-photo constants carry
 * the reasoning for each figure in their own headers; these names exist so a
 * chat file imports them from the module every chat file already imports,
 * rather than reaching into another feature's contracts at each call site.
 */
export {
  SESSION_PHOTO_JPEG_QUALITY as CHAT_IMAGE_JPEG_QUALITY,
  SESSION_PHOTO_MAX_BYTES as CHAT_IMAGE_MAX_BYTES,
  SESSION_PHOTO_MAX_EDGE as CHAT_IMAGE_MAX_EDGE,
} from "@/services/gedu-sessions/gedu-sessions.contracts";

/**
 * How long a sender may pause before their next message starts a new group.
 *
 * Grouping is what makes a chat log readable — one name header per run rather
 * than per line — and the gap is what stops a sender who returns an hour later
 * from being folded into the run they left. Five minutes is the standard-chat
 * convention the whole feature is written to.
 */
export const CHAT_GROUP_WINDOW_MS = 5 * 60_000;
