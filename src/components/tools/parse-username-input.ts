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
 * - **Anything carrying an `@` is separated out rather than submitted.** The
 *   server refuses it too (it is not a bare username), but a 400 for the whole
 *   batch is a worse answer than naming the entries and resetting the rest.
 */
export interface ParsedUsernameInput {
  /** Bare usernames, de-duplicated, in the order they were first written. */
  usernames: string[];
  /** Entries that look like an email address — flagged, never submitted. */
  emailLike: string[];
}

export function parseUsernameInput(raw: string): ParsedUsernameInput {
  const usernames: string[] = [];
  const emailLike: string[] = [];
  const seen = new Set<string>();

  for (const entry of raw.split(/[\s,]+/)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    if (trimmed.includes("@")) {
      if (!emailLike.includes(trimmed)) emailLike.push(trimmed);
      continue;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    usernames.push(trimmed);
  }

  return { usernames, emailLike };
}
