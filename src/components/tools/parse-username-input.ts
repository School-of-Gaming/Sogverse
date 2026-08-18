import { parseMinecraftEducationEntry } from "@/lib/constants/minecraft-education";

/**
 * Turn a pasted blob of usernames into the list to submit.
 *
 * The field is built for pasting a whole class list, which arrives however the
 * gedu had it — a comma-separated line out of a spreadsheet, one name per line
 * out of a document, or a space-separated run typed by hand — so all three
 * separators are accepted and the same three the Discord command splits on.
 *
 * Two things are done here rather than left to the server, because both are
 * answerable without a round trip and both change what the user should do next:
 *
 * - **Duplicates collapse**, case-insensitively, keeping the first spelling
 *   seen. A name pasted twice would otherwise be reset twice and the second
 *   password would silently invalidate the first one the reader just copied.
 *   The test is the entry as written, so `alice` and `alice@gamer.sog.gg`
 *   survive as two — they are one account, but nothing here can know that until
 *   Graph resolves the bare one, so the batch reset behind the route carries the
 *   guard for the pair that collide there.
 * - **An address on a domain this tool does not reset is separated out** rather
 *   than submitted. The server refuses it too — that gate is the real one, and
 *   it is what stops the tool being pointed at a staff mailbox — but a 400 for
 *   the whole batch is a worse answer than naming the entries and resetting the
 *   rest.
 *
 * A bare username and an address on one of the two allowed domains both go
 * through: which of the two a list arrives in is the exporting system's choice,
 * not something the reader should have to edit fifty lines to fix.
 */
export interface ParsedUsernameInput {
  /** What will be submitted: bare names and allowed-domain addresses. */
  usernames: string[];
  /** Entries naming a domain the tool does not reset — flagged, never sent. */
  unsupportedDomain: string[];
}

export function parseUsernameInput(raw: string): ParsedUsernameInput {
  const usernames: string[] = [];
  const unsupportedDomain: string[] = [];
  const seen = new Set<string>();

  for (const entry of raw.split(/[\s,]+/)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // `invalid` cannot arrive here — the split above is on whitespace, so no
    // entry is empty or carries a space — but the parser answers for callers
    // that did not split, and an unrecognised entry is not submittable either.
    const parsed = parseMinecraftEducationEntry(trimmed);
    if (parsed.kind === "bare" || parsed.kind === "addressed") {
      usernames.push(trimmed);
    } else {
      unsupportedDomain.push(trimmed);
    }
  }

  return { usernames, unsupportedDomain };
}
