import type { ChatAccount } from "./types";

/**
 * Mentions, as they travel inside a message body.
 *
 * **A mention rides in the body as a structured token, not in a join table.** A
 * v1 mention is display plus a highlight for the person named — it is not an
 * inbox, there is no badge and no notification — so a token the renderer turns
 * into a chip carries the whole feature, and the body stays the single thing a
 * send writes and an edit rewrites.
 *
 * The token is `@[Name](id)`: the name so a body read anywhere at all (a
 * quoted snippet, an export, a staff review) still says who was meant, and the
 * id so the highlight keys on an account rather than on a string somebody could
 * type. The name in the token is a *snapshot* and the id is the truth — a
 * renderer that has the account draws its current name.
 */

/**
 * Built fresh per call rather than held at module scope: a `/g` regex carries
 * `lastIndex` between calls, and a shared one silently skips the first match of
 * every other call.
 */
function mentionPattern(): RegExp {
  return /@\[([^\][]{1,64})]\(([0-9a-fA-F-]{36})\)/g;
}

/** One run of a parsed body. */
export type ChatBodySegment =
  | { kind: "text"; text: string }
  | { kind: "mention"; id: string; name: string };

/**
 * Splits a body into text and mention runs, in order.
 *
 * Anything that is not a well-formed token is text, including a bare `@name`
 * somebody typed by hand — which is the right answer: an unresolved `@` is not
 * a mention of anybody, and quietly styling it would promise a highlight that
 * never arrives.
 */
export function parseChatBody(body: string): ChatBodySegment[] {
  const segments: ChatBodySegment[] = [];
  const pattern = mentionPattern();
  let cursor = 0;

  for (let match = pattern.exec(body); match !== null; match = pattern.exec(body)) {
    if (match.index > cursor) {
      segments.push({ kind: "text", text: body.slice(cursor, match.index) });
    }
    segments.push({ kind: "mention", name: match[1], id: match[2] });
    cursor = match.index + match[0].length;
  }

  if (cursor < body.length) {
    segments.push({ kind: "text", text: body.slice(cursor) });
  }
  return segments;
}

/** The accounts a body names, deduplicated, in the order they appear. */
export function chatMentionIds(body: string | null): string[] {
  if (body === null) return [];
  const ids: string[] = [];
  for (const segment of parseChatBody(body)) {
    if (segment.kind === "mention" && !ids.includes(segment.id)) {
      ids.push(segment.id);
    }
  }
  return ids;
}

/** Whether a body names this account. */
export function chatBodyMentions(body: string | null, accountId: string): boolean {
  return chatMentionIds(body).includes(accountId);
}

/**
 * The body as plain words — tokens flattened to `@Name`.
 *
 * What a quoted snippet and a screen reader want: the sentence as it reads,
 * with no markup and no chip. The `@` stays because it is part of how the
 * sentence sounds.
 */
export function chatBodyPlainText(body: string | null): string {
  if (body === null) return "";
  return parseChatBody(body)
    .map((segment) => (segment.kind === "text" ? segment.text : `@${segment.name}`))
    .join("");
}

/** The token to splice into a draft when somebody picks a name. */
export function chatMentionToken(account: ChatAccount): string {
  return `@[${account.name}](${account.id})`;
}
