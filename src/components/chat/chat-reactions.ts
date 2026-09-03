import { CHAT_REACTION_CODES, type ChatReactionCode } from "@/lib/constants/chat";
import type { ChatReactionEntry } from "./types";

/** One reaction's tally on one message. */
export interface ChatReactionTally {
  code: ChatReactionCode;
  count: number;
  /** Whether the viewer is one of the people counted. */
  mine: boolean;
}

/**
 * A message's reactions, tallied for display.
 *
 * **The order is the approved set's order, not arrival order.** Reactions
 * toggle constantly, and a row that reshuffled every time somebody was the
 * first to press a different face would move the button under a reader's
 * cursor — the exact in-place shift the layout rule forbids. Fixing the order
 * to the constants module's means a pill only ever appears at, or disappears
 * from, a position the set already decided.
 */
export function tallyChatReactions(
  reactions: readonly ChatReactionEntry[],
  viewerId: string,
): ChatReactionTally[] {
  const tallies: ChatReactionTally[] = [];
  for (const code of CHAT_REACTION_CODES) {
    const forCode = reactions.filter((entry) => entry.code === code);
    if (forCode.length === 0) continue;
    tallies.push({
      code,
      count: forCode.length,
      mine: forCode.some((entry) => entry.senderId === viewerId),
    });
  }
  return tallies;
}

/**
 * The reaction list after this person presses this face.
 *
 * One per emoji per person, so pressing it again takes it back — the Slack and
 * Discord toggle model, which is the one every reader already has in their
 * hands.
 */
export function toggleChatReaction(
  reactions: readonly ChatReactionEntry[],
  code: ChatReactionCode,
  senderId: string,
): ChatReactionEntry[] {
  const existing = reactions.some(
    (entry) => entry.code === code && entry.senderId === senderId,
  );
  if (existing) {
    return reactions.filter(
      (entry) => !(entry.code === code && entry.senderId === senderId),
    );
  }
  return [...reactions, { code, senderId }];
}
