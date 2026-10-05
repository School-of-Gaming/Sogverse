/**
 * Words per minute an adult reads screen prose at — the conventional figure
 * reading-time estimates use, and deliberately a round one: the number shown
 * is a promise about effort, not a measurement, and a parent deciding whether
 * to read now or later needs "about five minutes", not a precise count.
 */
const WORDS_PER_MINUTE = 200;

/**
 * An article's reading time in whole minutes, from its markdown body.
 *
 * Derived from the body rather than authored beside it, so it cannot drift from
 * the text it describes when the text is edited. Only the text a reader reads
 * is counted: link and image destinations and autolinked addresses are dropped
 * first, and words are then runs of letters and digits in any script, which
 * leaves markdown's own syntax — `#`, `**`, `|`, `\` — uncounted. Never less
 * than one minute: "0 min read" reads as an empty page.
 */
export function readingMinutes(markdown: string): number {
  const readable = markdown
    // `[text](address "title")` and `![alt](address)` keep their text.
    .replace(/\]\([^)]*\)/g, "]")
    // `<https://…>` autolinks are an address, not prose.
    .replace(/<[a-z][a-z0-9+.-]*:[^>\s]*>/gi, " ")
    // Apostrophes go, so "don't" is one word rather than two.
    .replace(/['’]/g, "");
  const words = readable.match(/[\p{L}\p{N}]+/gu);
  return Math.max(1, Math.round((words?.length ?? 0) / WORDS_PER_MINUTE));
}
