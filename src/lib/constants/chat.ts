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
 * The character cap on one message's body.
 *
 * Inherited from the app-message chat this replaces: 500 characters is a
 * paragraph, and a chat log is not where anybody writes an essay. The composer
 * enforces it and the send RPC will enforce it again.
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
 * How long a sender may pause before their next message starts a new group.
 *
 * Grouping is what makes a chat log readable — one name header per run rather
 * than per line — and the gap is what stops a sender who returns an hour later
 * from being folded into the run they left. Five minutes is the standard-chat
 * convention the whole feature is written to.
 */
export const CHAT_GROUP_WINDOW_MS = 5 * 60_000;
