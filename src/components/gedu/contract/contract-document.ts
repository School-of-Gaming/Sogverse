/**
 * The block model for the Gedu contract — the binding terms a gedu accepts on
 * the platform before taking assignments.
 *
 * This is deliberately *not* a markdown AST and deliberately not the shared
 * `Markdown` renderer: that one exists for user-authored stored fields, where
 * the input is unknown and has to be defended against. This document is the
 * opposite — a fixed, binding legal text transcribed into the repo, reviewed
 * like code, and changed only by shipping a new version. So the model carries
 * exactly the constructs this document uses and nothing more; a construct the
 * next version needs is added here, in the same change that adds it to the text.
 *
 * A version of the contract exists in one or more languages, and the languages
 * of one version are **equally binding** — one agreement published twice, not a
 * source text and a courtesy translation. Whichever text a gedu read is the text
 * they signed, so the language is part of the record; the registry
 * (`documents/index.ts`) holds every transcribed pair and encodes the language
 * into the version string that acceptance stores.
 *
 * A document renders verbatim whatever the reader's locale — it is a contract,
 * not UI copy, so it never goes through `messages/`. Which of the transcribed
 * texts is shown follows the locale; the text itself is never translated on the
 * way to the screen, and never machine-translated on the way into the repo.
 */

/**
 * Body text with two pieces of inline markup, and no others:
 *
 * - `**bold**` marks a defined term ("**Tuottaja**"), exactly as the source
 *   document does. Kept as markers in the string rather than pre-split into
 *   segments so a transcribed clause reads, in the source file, as close to the
 *   original sentence as possible — which is what makes it reviewable against
 *   the original by eye.
 * - `\n` is a hard line break inside one block (a signature block, an address
 *   in a table cell). It does *not* start a new paragraph.
 *
 * An unmatched `**` is never markup: it renders as the literal characters it
 * is. Dropping text from a binding document is the one thing this renderer must
 * not do, so anything it does not recognise survives as its own words.
 */
export type GeduContractText = string;

/** One inline run of a line: the words, and whether they are a defined term. */
export interface GeduContractSegment {
  text: string;
  bold: boolean;
}

/**
 * A cell of the parties table. The source's table has no header row — its first
 * row is already a party — so the model has no header concept either.
 */
export type GeduContractCell = GeduContractText;

export type GeduContractBlock =
  /**
   * A heading. `2` is a top-level division of the document (a numbered clause
   * group, OSAPUOLET, LIITE A); `3` is a division inside one (2.1 Yleiset).
   * The numbers are the heading levels the renderer emits — the document's own
   * title is the h1 — and clause numbers are part of `text`, never generated:
   * the document cross-references them ("kohdan 4.7 mukaisesti"), so a number
   * that shifted because a block moved would silently break a reference.
   */
  | { kind: "heading"; level: 2 | 3; text: GeduContractText }
  | { kind: "paragraph"; text: GeduContractText }
  | { kind: "bullets"; items: GeduContractText[] }
  | { kind: "table"; rows: GeduContractCell[][] }
  /** The source's `---` rules, which separate the document's major parts. */
  | { kind: "separator" };

/**
 * Languages a version of the contract can exist in. Both texts of a version are
 * the agreement rather than one being the agreement and the other a rendering of
 * it, so neither is subordinate here — what differs between them is only which
 * one a version is guaranteed to have (see the fallback language in
 * `documents/index.ts`), and each is written by a lawyer, never translated.
 */
export type GeduContractLanguage = "fi" | "en";

export interface GeduContractDocument {
  /** The version these terms are, e.g. `"2026-2027"`. Stored on acceptance. */
  version: string;
  language: GeduContractLanguage;
  /** The document's own title, rendered as the h1. */
  title: GeduContractText;
  blocks: GeduContractBlock[];
}

/**
 * Splits one piece of {@link GeduContractText} into lines of inline segments —
 * the outer array is the hard line breaks, the inner one the bold/plain runs.
 *
 * Empty runs are dropped so the renderer never emits an empty element, and
 * bold markers are matched non-greedily against a run with no `*` in it, which
 * makes a stray marker fail to match and survive as literal text.
 */
export function geduContractLines(
  text: GeduContractText,
): GeduContractSegment[][] {
  return text.split("\n").map((line) => {
    // Declared per call: a `g` regex carries `lastIndex` between calls, and a
    // shared one would make each line depend on the one before it.
    const boldPattern = /\*\*([^*]+)\*\*/g;
    const segments: GeduContractSegment[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null;

    while ((match = boldPattern.exec(line)) !== null) {
      if (match.index > cursor) {
        segments.push({ text: line.slice(cursor, match.index), bold: false });
      }
      segments.push({ text: match[1], bold: true });
      cursor = match.index + match[0].length;
    }

    if (cursor < line.length) {
      segments.push({ text: line.slice(cursor), bold: false });
    }
    return segments;
  });
}
