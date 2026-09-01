import { isChatReactionCode } from "@/lib/constants/chat";
import type {
  ChatAccount,
  ChatMessage,
  ChatReactionEntry,
} from "@/components/chat";
import type { ChatChannelRoster, ChatHistory } from "@/services/chat";

/**
 * The turn from stored rows to the shapes the chat components draw.
 *
 * **Pure, and beside the container rather than inside it.** The components are
 * transport-free by contract — they take messages and accounts and know nothing
 * about where either came from — so *something* has to do this mapping, and
 * keeping it out of the subscriber leaves that file about the socket. Every
 * function here is a function of its arguments alone, which is also what makes
 * it readable without a React tree in mind.
 */

/**
 * Who the log can name, with the viewer guaranteed to be in it.
 *
 * The roster RPC returns the group's seat-holders, the product's assigned gedus
 * and everyone who has spoken — which is everything enumerable, but not
 * everything admitted: an admin dropping into a room is a member the moment
 * they hold a session, and appears in the roster only once they have sent
 * something. So the viewer is appended when the list does not already carry
 * them.
 *
 * **Appending is safe for mentions and inserting would not be.** Mention
 * resolution settles two accounts sharing a name by list position, and the
 * roster's order is the server's; the viewer is filtered out of the mentionable
 * list before any of that happens, so adding them at the end cannot change what
 * anybody's `@Name` resolves to.
 */
export function toChatAccounts(
  roster: ChatChannelRoster,
  viewer: ChatAccount,
): ChatAccount[] {
  const accounts = roster.map((entry) => ({
    id: entry.id,
    name: entry.first_name,
    role: entry.role,
  }));
  return accounts.some((account) => account.id === viewer.id)
    ? accounts
    : [...accounts, viewer];
}

/**
 * The log, oldest first, with each message carrying its own reactions.
 *
 * The history read hands back three flat lists because that is how three
 * realtime streams patch them; the nesting a bubble wants is derived here, once
 * per render of the panel rather than once per reaction anybody presses.
 *
 * **A code the build does not know is dropped rather than drawn.** The approved
 * set is a CHECK constraint mirroring an app constant, so the two can differ for
 * exactly as long as it takes a deploy to follow a migration — and a reaction
 * with no glyph is better left out than rendered as a hole.
 */
export function toChatMessages(history: ChatHistory): ChatMessage[] {
  const reactionsByMessage = new Map<string, ChatReactionEntry[]>();
  for (const reaction of history.reactions) {
    if (!isChatReactionCode(reaction.code)) continue;
    const entries = reactionsByMessage.get(reaction.message_id) ?? [];
    entries.push({ code: reaction.code, senderId: reaction.sender_id });
    reactionsByMessage.set(reaction.message_id, entries);
  }

  return history.messages.map((row) => ({
    id: row.id,
    senderId: row.sender_id,
    createdAt: row.created_at,
    body: row.body,
    image:
      row.image_width !== null && row.image_height !== null
        ? {
            id: row.id,
            // Resolved by whoever holds the bucket — which nothing does yet.
            // The image step mints a signed URL per image here; until then no
            // path in the product can produce an image row, because the
            // composer's image drafts are dropped before they reach a send.
            src: "",
            width: row.image_width,
            height: row.image_height,
          }
        : null,
    replyToId: row.reply_to_message_id,
    editedAt: row.edited_at,
    hiddenAt: row.hidden_at,
    hiddenBy: row.hidden_by,
    reactions: reactionsByMessage.get(row.id) ?? [],
    // Everything that came back from the server is, by definition, settled.
    // The pending and failed rows are the container's own and never live here.
    delivery: "sent" as const,
  }));
}

/**
 * Who is currently locked, as far as this viewer is allowed to know.
 *
 * A participant may read only their own lock row, so an empty set means "nobody
 * I am permitted to see" rather than "nobody" — which is exactly what the UI
 * needs, since the only lock a non-moderator has to act on is their own.
 * Unlocking clears the stamp rather than deleting the row, so the standing
 * locks are the rows with a stamp on them.
 */
export function toLockedAccountIds(history: ChatHistory): Set<string> {
  return new Set(
    history.locks
      .filter((lock) => lock.locked_at !== null)
      .map((lock) => lock.user_id),
  );
}
