import { CHAT_GROUP_WINDOW_MS } from "@/lib/constants/chat";
import type { ChatMessage } from "./types";

/**
 * Sender grouping — the arithmetic that turns a flat log into something
 * readable.
 *
 * Two conventions, both standard-chat and neither invented here:
 *
 * - **One name header per run.** Consecutive messages from one sender inside a
 *   short window share a header and an avatar; a new sender, or a long enough
 *   pause, starts a new run. The timestamp goes on the run's boundary, which is
 *   the only place it says anything a reader did not already know.
 * - **A burst of images is one visual unit.** The composer stages and the send
 *   fans out, so five pictures arrive as five rows a millisecond apart — and
 *   rendered as five stacked bubbles that is a wall, not a set. Consecutive
 *   image-only messages inside one run collapse into a single wrapping
 *   thumbnail row, which is how the same five pictures read on the session feed.
 *
 * **Nothing is dropped and nothing is reordered.** A removed message keeps its
 * position as a tombstone — that is what holds a reader's place when somebody
 * deletes something above where they are reading — and it never joins an image
 * run, because there is no longer a picture to put in one.
 */

/** One rendered unit inside a run. */
export type ChatGroupItem =
  | { kind: "message"; message: ChatMessage }
  | { kind: "images"; messages: readonly ChatMessage[] };

/** A run of messages from one sender, drawn under one header. */
export interface ChatMessageGroup {
  /** Stable across a re-group: the first message's id. */
  key: string;
  senderId: string;
  /** The run's first message's instant — what the header's time shows. */
  startedAt: string;
  items: readonly ChatGroupItem[];
}

/**
 * Whether `message` continues the run `previous` belongs to.
 *
 * The gap is measured against the *previous message*, not against the run's
 * start, so a slow conversation stays one run while an hour's silence breaks
 * it. An unparseable instant breaks the run rather than folding into it: a
 * fixture or a payload with a bad date should look wrong, not quietly
 * rearrange somebody else's messages under one name.
 */
function continuesRun(
  previous: ChatMessage,
  message: ChatMessage,
  windowMs: number,
): boolean {
  if (previous.senderId !== message.senderId) return false;
  const before = Date.parse(previous.createdAt);
  const after = Date.parse(message.createdAt);
  if (Number.isNaN(before) || Number.isNaN(after)) return false;
  return after - before <= windowMs;
}

/** Whether a message can sit inside a wrapping thumbnail row. */
function joinsImageRun(message: ChatMessage): boolean {
  return message.image !== null && message.hiddenAt === null;
}

/**
 * Groups a log, oldest first, into runs.
 *
 * The input order is the render order — this never sorts. A caller holding
 * messages in any other order has a bug the grouping must not hide.
 */
export function groupChatMessages(
  messages: readonly ChatMessage[],
  windowMs: number = CHAT_GROUP_WINDOW_MS,
): ChatMessageGroup[] {
  const groups: ChatMessageGroup[] = [];
  let items: ChatGroupItem[] = [];
  let previous: ChatMessage | null = null;

  const flush = () => {
    if (previous === null || items.length === 0) return;
    const first = items[0];
    const firstMessage =
      first.kind === "message" ? first.message : first.messages[0];
    groups.push({
      key: firstMessage.id,
      senderId: firstMessage.senderId,
      startedAt: firstMessage.createdAt,
      items,
    });
    items = [];
  };

  for (const message of messages) {
    if (previous !== null && !continuesRun(previous, message, windowMs)) {
      flush();
    }

    // The run's last item, or nothing at all on a fresh run.
    const tail = items.length > 0 ? items[items.length - 1] : null;
    if (!joinsImageRun(message)) {
      items.push({ kind: "message", message });
    } else if (tail !== null && tail.kind === "images") {
      items[items.length - 1] = {
        kind: "images",
        messages: [...tail.messages, message],
      };
    } else {
      items.push({ kind: "images", messages: [message] });
    }

    previous = message;
  }

  flush();
  return groups;
}
