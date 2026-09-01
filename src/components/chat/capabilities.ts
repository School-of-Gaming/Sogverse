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
 *
 * ## The moderation symmetry principle
 *
 * **Per-person moderation acts are symmetric: any moderator may apply them to
 * anyone, fellow moderators and admins included. Lock-class acts are not.**
 * (Platform principle, owner ruling 2026-09-01 — it governs every surface with
 * moderator controls, not only this one.)
 *
 * The split is what the act *does*. Removing a message — like muting a mic in a
 * voice room — acts on one thing that was said, in front of the people who saw
 * it; it is reversible, it is recorded, and the person it lands on keeps every
 * capability they had a moment earlier. Something a gedu should not have posted
 * is exactly as much of a problem as something a child should not have posted,
 * and a rule exempting staff would make the one message nobody could take down
 * the one a moderator is standing next to. So `canHide` carries no mod-vs-mod
 * test, deliberately, and this is the sentence that says the omission is a
 * decision rather than an oversight.
 *
 * A **lock** is the other class: it takes a person's voice away for as long as
 * it stands, which is a judgement about the person rather than about a message.
 * Between colleagues that is not moderation, it is a way for one member of staff
 * to silence another in front of the children they are both responsible for —
 * so `lockControl` excludes fellow moderators (and the viewer themselves), and a
 * staff problem is handled off the platform, by people, as it should be.
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
  /**
   * Delete their own message, leaving the tombstone — including one that never
   * went (see the rules on the derivation below).
   */
  canDelete: boolean;
  /**
   * Remove somebody else's message for everyone, leaving the same tombstone.
   *
   * Symmetric by design: a moderator may remove any message, including one a
   * fellow gedu or an admin sent. See the principle in this module's header.
   */
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
   *
   * The asymmetric half of the principle in this module's header: a lock is a
   * judgement about a person rather than about a message, so it is not offered
   * against a colleague.
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
 *   own retry is the affordance, and it lives on the bubble rather than in the
 *   menu. **Deleting a *failed* one is the exception** *(owner ruling)*: a
 *   refusal leaves a bubble sitting in the sender's own log with nothing but a
 *   retry on it, and "it did not go and I want it gone" is a want the surface
 *   has to answer or the row is there until the page is. Nothing is asked of
 *   the server — there is no row to soft-delete — so it is the optimistic echo
 *   being dropped, which is why it does not need the message to be settled.
 *   **Pending stays excluded**, because a send still in flight has an outcome
 *   coming: deleting it would race the acknowledgement, and the honest answer
 *   is to wait the moment out and then delete it either way it lands.
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
  // Settled, or refused outright — the two states a sender may take a message
  // of their own back from. A send still in flight is neither.
  const deletable = settled || message.delivery === "failed";

  const senderModerates = sender !== null && isChatModerator(sender.role);

  return {
    canEdit: own && !hidden && writable && message.body !== null,
    canDelete: own && !hidden && deletable,
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
