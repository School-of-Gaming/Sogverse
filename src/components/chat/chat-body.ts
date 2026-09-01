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
 *
 * **The writer never meets that token.** A composer shows `@Name` — the form
 * the sentence actually reads in — and the substitution happens once, at send,
 * in `resolveChatMentions` below. So this module has two directions: parsing a
 * stored body for a renderer, and resolving a written one for the wire.
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

/** The stored token for one account. */
export function chatMentionToken(account: ChatAccount): string {
  return `@[${account.name}](${account.id})`;
}

/**
 * Whether a name continues past its match — a letter or a digit immediately
 * after it, which means the reader typed a longer word than the name.
 *
 * `@Ainoa` is not a mention of Aino: the account list says nothing about an
 * Ainoa, and half-matching the word would put somebody's chip in front of a
 * stray letter. Punctuation and whitespace end a name (`@Aino,` and `@Aino!`
 * both resolve), which is the whole reason this is a character class rather
 * than a whitespace test.
 */
function endsAName(text: string, at: number): boolean {
  // The end of the message ends a name too — a mention is allowed to be the
  // last thing somebody wrote.
  if (at >= text.length) return true;
  return !/[\p{L}\p{N}]/u.test(text[at]);
}

/**
 * Turns the mentions a writer typed into the tokens a body stores.
 *
 * **The composer shows `@Name`; the wire carries `@[Name](id)`.** The stored
 * form is what makes a mention survive a rename and key its highlight on an
 * account rather than on a string — but it is unreadable, and a writer watching
 * their own sentence fill with brackets and a UUID is watching the product's
 * plumbing *(owner ruling)*. So the suggestion picker inserts the display form
 * and this runs once, at send, over what they wrote. Nothing else changes: the
 * token, the parser and every renderer are exactly as they were.
 *
 * The consequence worth stating: a mention no longer has to come from the
 * picker. Somebody who types `@Aino` because they know how it is spelt gets the
 * same mention as somebody who picked her from the list, which is what a reader
 * expects and what the picker's `@Name` output makes indistinguishable anyway.
 * (The **rendering** rule is unchanged and unrelated: a bare `@name` inside an
 * already-stored body stays plain text, because by then it is a mention nobody
 * resolved.)
 *
 * The matching rules, all three load-bearing:
 *
 * - **Case-insensitive**, because nobody capitalises a name mid-sentence to
 *   satisfy a parser, and the token stores the account's own spelling either
 *   way — so `@aino` and `@AINO` both become Aino.
 * - **Longest name first.** A name that prefixes another ("Aino" and "Aino
 *   Virtanen") would otherwise resolve to the shorter one and leave the rest of
 *   the name stranded as text beside a chip for the wrong person.
 * - **No match stays exactly as typed.** `@nobody` is a mention of nobody, and
 *   the `@` is part of a sentence somebody wrote rather than markup to clean up.
 *
 * **A duplicate name resolves to whichever account the caller listed first**,
 * which is a v1 tolerance rather than an answer: two people called Aino in one
 * chat is a real possibility and the display form genuinely cannot tell them
 * apart. It is accepted because the wrong Aino gets a highlight she was not
 * meant to see and nothing else happens — v1 mentions have no notification and
 * no inbox. Whatever fixes it (a disambiguated display form, resolving against
 * the picked account rather than the text) is a design decision, not a patch.
 */
export function resolveChatMentions(
  text: string,
  accounts: readonly ChatAccount[],
): string {
  if (text.length === 0 || accounts.length === 0) return text;

  // Longest first. `sort` is stable, so accounts whose names are the same
  // length keep the caller's order — which is what makes the duplicate-name
  // tolerance above a stated rule rather than whatever the engine felt like.
  const candidates = [...accounts].sort(
    (left, right) => right.name.length - left.name.length,
  );

  let out = "";
  let cursor = 0;

  for (let at = text.indexOf("@"); at !== -1; at = text.indexOf("@", cursor)) {
    out += text.slice(cursor, at);
    const start = at + 1;
    const matched = candidates.find((account) => {
      const end = start + account.name.length;
      return (
        text.slice(start, end).toLowerCase() === account.name.toLowerCase() &&
        endsAName(text, end)
      );
    });

    if (matched === undefined) {
      out += "@";
      cursor = start;
    } else {
      out += chatMentionToken(matched);
      cursor = start + matched.name.length;
    }
  }

  return out + text.slice(cursor);
}
