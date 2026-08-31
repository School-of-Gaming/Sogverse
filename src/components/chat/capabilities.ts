import type { ChatAccount, ChatMessage, ChatRole } from "./types";

/**
 * What this viewer may do — the one piece of chat permission logic that
 * genuinely is client-side.
 *
 * Everything else about chat authorization belongs to the database: a send goes
 * through a guarded RPC, a read through an RLS policy scoped to channel
 * membership, and hiding a button is cosmetic defense-in-depth exactly as it is
 * in the voice room. What this module owns is the *offer*: which controls a
 * composer and a message menu put in front of somebody, given who they are and
 * whether they are locked. That question has no server answer to wait for and
 * has to be settled before first paint, so it is a pure function of state the
 * client already holds.
 *
 * **It is a production module driven by fixtures in the preview scene, not a
 * preview module.** The scene switches the mock account and the derivation
 * re-runs for real; the wire-up swaps the fixture state for the live one and
 * the derivation does not change.
 *
 * Two shapes rather than one, because they answer at different rates: the
 * composer's answer is per viewer and changes when a lock lands, and a
 * message's answer is per row.
 */

/** Admin and gedu hold every moderator control; nobody else holds any. */
const MODERATOR_ROLES: readonly ChatRole[] = ["admin", "gedu"];

/**
 * Whether a role moderates.
 *
 * **A positive allow-list, never an exclusion.** The voice room learned this the
 * expensive way: a negative test ("not a gamer") hands moderation to whichever
 * role is admitted next, and admitting parents to voice rooms would have done
 * exactly that. A parent in a chat is a participant with no moderator
 * capabilities — guest-equivalent, exactly like a child.
 */
export function isChatModerator(role: ChatRole): boolean {
  return MODERATOR_ROLES.includes(role);
}

/** What the viewer is, and what the channel has done to them. */
export interface ChatViewerState {
  viewer: ChatAccount;
  /**
   * Whether a moderator has locked *this viewer* out of this channel.
   *
   * Keyed on the lock, not on the role: the control is moderator-gated, so a
   * moderator has no path to being locked, but the derivation states the rule
   * it means rather than the rule that happens to be reachable.
   */
  locked: boolean;
}

/** What the composer offers. */
export interface ChatComposerCapabilities {
  /** Whether the text field and Send are live. */
  canSend: boolean;
  /** Whether the image controls (pick, paste, drop) are live. */
  canAttachImages: boolean;
  /**
   * Whether the composer draws its locked explanation in place of the field.
   *
   * Distinct from `!canSend`, and deliberately: a future surface could refuse
   * sends for a reason that is not a lock, and the locked *state* is a specific
   * thing a reader is owed an explanation of.
   */
  showsLockNotice: boolean;
}

/** What one message's menu offers this viewer. */
export interface ChatMessageCapabilities {
  /** Edit in place — the sender's own, standing message. */
  canEdit: boolean;
  /** Delete their own message, leaving the tombstone. */
  canDelete: boolean;
  /** Remove somebody else's message for everyone, leaving the same tombstone. */
  canHide: boolean;
  /** Restore a removed message. Moderators only, and only on a removed one. */
  canRestore: boolean;
  /** Quote-reply to it. */
  canReply: boolean;
  /** Add or take back a reaction. */
  canReact: boolean;
  /**
   * Whether the dimmed original shows under the tombstone.
   *
   * Moderators keep reading what was removed — that is the point of a soft
   * delete, and it is why removing something is not also destroying the
   * evidence of it. Everybody else gets the tombstone alone.
   */
  canSeeHiddenBody: boolean;
  /**
   * Whether the menu offers to lock this message's sender out of the chat, and
   * which way the switch points. `null` where no lock control is offered at
   * all — the viewer is not a moderator, or the sender is.
   */
  lockControl: "lock" | "unlock" | null;
}

/**
 * The composer's offer.
 *
 * A locked member keeps reading — the whole design of the control is that it
 * takes the keyboard away and leaves the room — so the notice replaces the
 * field rather than the panel.
 */
export function deriveChatComposerCapabilities(
  state: ChatViewerState,
): ChatComposerCapabilities {
  const canSend = !state.locked;
  return {
    canSend,
    canAttachImages: canSend,
    showsLockNotice: state.locked,
  };
}

/**
 * One message's offer.
 *
 * The rules, in the order they bite:
 *
 * - **A removed message offers almost nothing.** No edit, no reply, no
 *   reaction: there is nothing left on screen to answer. A moderator may put it
 *   back, which is the one control a tombstone carries.
 * - **A lock takes away everything that writes**, reactions and replies
 *   included. A reaction is a message with fewer characters, and a member
 *   locked out of chat who could still react would have been locked out of
 *   nothing. **Deleting their own message is the one exception**: a lock stops
 *   somebody saying anything *new*, and taking back something they regret is
 *   the one thing a locked member most plausibly still wants — refusing it
 *   would make the lock a punishment rather than a control.
 * - **Edit and delete are the sender's own**, always, and a moderator's
 *   removal of their *own* message is a delete rather than a hide — one control
 *   per row, so the menu never offers two words for the same outcome.
 * - **A pending or failed message is not a thing yet.** Nobody can react to it,
 *   quote it, or moderate it, because the server has not seen it; the sender's
 *   own retry is the only affordance, and it lives on the bubble rather than in
 *   the menu.
 */
export function deriveChatMessageCapabilities(
  state: ChatViewerState,
  message: ChatMessage,
  sender: ChatAccount | null,
  /** Whether the *sender* is currently locked — drives the lock/unlock switch. */
  senderLocked: boolean,
): ChatMessageCapabilities {
  const moderator = isChatModerator(state.viewer.role);
  const own = message.senderId === state.viewer.id;
  const hidden = message.hiddenAt !== null;
  const settled = message.delivery === "sent";
  const writable = !state.locked && settled;

  const senderModerates = sender !== null && isChatModerator(sender.role);

  return {
    canEdit: own && !hidden && writable && message.body !== null,
    canDelete: own && !hidden && settled,
    canHide: moderator && !own && !hidden && settled,
    canRestore: moderator && hidden,
    canReply: !hidden && writable,
    canReact: !hidden && writable,
    canSeeHiddenBody: moderator && hidden,
    lockControl:
      moderator && !own && !senderModerates
        ? senderLocked
          ? "unlock"
          : "lock"
        : null,
  };
}
