import type { ProductLongDescription } from "@/types";

/**
 * Which markdown heading level a `heading` block becomes.
 *
 * A parameter rather than a constant because the answer is a design decision
 * about the page the text lands on, not a property of the conversion: the block
 * format never recorded a level (there was only one kind of heading), so
 * something has to choose one, and the only way to choose it is to look at the
 * rendered page. The renderer caps the styled subset at three levels, which is
 * why this does too.
 */
export type MarkdownHeadingLevel = 1 | 2 | 3;

/**
 * **Turn a structured long description into the markdown that replaces it.**
 *
 * The stored value used to be a flat, ordered array of heading/paragraph blocks
 * holding **plain text** — no marks, no links, no lists — rendered with each
 * block's text dropped straight into an element. Markdown is the replacement
 * format, and the whole risk of the move is that the same bytes mean something
 * different in it: a paragraph that reads `We use * for the build queue` is six
 * words today and the start of an emphasis run tomorrow. So every character
 * that could be read as syntax is escaped on the way out. **A converted value
 * must render exactly the words the block rendered, and never gain formatting
 * nobody typed.**
 *
 * Pure and side-effect free, so it can be unit tested against adversarial text
 * and reused for the one-shot data conversion when the column changes type.
 *
 * **What is preserved.** Block order; heading-versus-paragraph; every literal
 * character of the text; and the single newlines inside a paragraph, which
 * become hard breaks — today's paragraphs render with `whitespace-pre-line`, so
 * a break the admin typed is visible on the page and has to survive. A run of
 * blank lines inside one block becomes an ordinary paragraph break, which is
 * what it already looks like.
 *
 * **What is lost, deliberately, because markdown cannot represent it.** Two
 * things, both stated here because neither is recoverable afterwards:
 *
 * 1. **Leading indentation is stripped from every line.** Four or more leading
 *    spaces open an indented code block, which would render the line in a
 *    monospace box — a much bigger change than losing the spaces. Trailing
 *    whitespace goes with it, since two trailing spaces are themselves a hard
 *    break.
 * 2. **Newlines inside a heading are flattened to single spaces.** An ATX
 *    heading is one line by definition; the alternative is splitting one
 *    heading into several, which invents structure.
 *
 * A block whose text is blank is dropped rather than emitted as an empty
 * heading or paragraph. It renders as nothing but a margin today, and an empty
 * ATX heading is a construct with no reason to exist in stored copy.
 */
export function longDescriptionToMarkdown(
  blocks: ProductLongDescription,
  headingLevel: MarkdownHeadingLevel,
): string {
  const hashes = "#".repeat(headingLevel);
  return blocks
    .map((block) =>
      block.type === "heading"
        ? headingToMarkdown(block.text, hashes)
        : paragraphToMarkdown(block.text),
    )
    .filter((chunk) => chunk !== "")
    .join("\n\n");
}

/**
 * Characters that have to be neutralised wherever they appear in a line, plus
 * the one that only has to be neutralised sometimes.
 *
 * The literal set is the inline punctuation a stray occurrence of which changes
 * how the text around it renders: `\` (the escape character itself, first so it
 * cannot double-escape what follows), `` ` `` (code), `*` and `_` (emphasis),
 * `[` and `]` (links and images), `<` (autolinks and raw HTML), `~`
 * (strikethrough). Escaping `[` alone would be enough to stop a link forming;
 * `]` is escaped too so a lone bracket cannot pair with one that arrives later
 * from an edit.
 *
 * **`&` is escaped only when a character reference follows it**, which is the
 * only time it means anything: `Bring a mouse & a headset` is fine as it
 * stands, while `AT&amp;T` would otherwise decode to `AT&T`. The lookahead
 * recognises the *shape* of a reference rather than checking it against the
 * HTML entity table — an over-escaped `&` is invisible in the output (a
 * backslash before ASCII punctuation renders as the punctuation), whereas a
 * missed one silently rewrites somebody's copy, so the cheap error is the one
 * worth making.
 */
const INLINE_SYNTAX =
  /[\\`*_[\]<~]|&(?=[a-zA-Z][a-zA-Z0-9]{0,30};|#[0-9]{1,7};|#[xX][0-9a-fA-F]{1,6};)/g;

/** A leading ordered-list marker: `1.` / `12)` and friends. */
const LEADING_ORDERED_MARKER = /^([0-9]{1,9})([.)])/;

/**
 * Leading characters that open a block-level construct: a bullet (`-`, `+`), a
 * blockquote (`>`), a setext underline (`=`, and `-` again), a table row (`|`),
 * an ATX heading (`#`). `*` and `_` are bullets and thematic rules too, and are
 * already escaped by the inline pass.
 */
const LEADING_BLOCK_MARKER = /^[-+>=|#]/;

/**
 * An ATX closing sequence: trailing hashes after whitespace, which markdown
 * eats rather than renders. `## Ready? #` would otherwise lose its final
 * character.
 */
const CLOSING_HASHES = /(^|\s)(#+)$/;

function headingToMarkdown(text: string, hashes: string): string {
  const oneLine = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ");
  if (oneLine === "") return "";
  const escaped = oneLine
    .replace(INLINE_SYNTAX, (match) => `\\${match}`)
    .replace(CLOSING_HASHES, (_match, before: string, run: string) =>
      `${before}\\${run}`,
    );
  return `${hashes} ${escaped}`;
}

function paragraphToMarkdown(text: string): string {
  // Blank lines split one block into several markdown paragraphs; the lines
  // within a run are joined with a trailing backslash, which is a hard break.
  // (Two trailing spaces would do the same and is invisible in the stored
  // value, so the next person to touch it would strip it without knowing.)
  const paragraphs: string[] = [];
  let run: string[] = [];

  for (const rawLine of text.split("\n")) {
    const line = escapeLine(rawLine);
    if (line === "") {
      if (run.length > 0) {
        paragraphs.push(run.join("\\\n"));
        run = [];
      }
      continue;
    }
    run.push(line);
  }
  if (run.length > 0) paragraphs.push(run.join("\\\n"));

  return paragraphs.join("\n\n");
}

/**
 * One line of paragraph text, made inert.
 *
 * Trimmed first (see the lossiness note on the exported function), then the
 * inline pass, then the line-start pass. That order matters: the inline pass
 * inserts backslashes, and a line it has already escaped no longer *starts*
 * with a block marker, so the second pass cannot double-escape what the first
 * one handled.
 */
function escapeLine(rawLine: string): string {
  const trimmed = rawLine.trim();
  if (trimmed === "") return "";
  const inline = trimmed.replace(INLINE_SYNTAX, (match) => `\\${match}`);
  const ordered = LEADING_ORDERED_MARKER.exec(inline);
  if (ordered !== null) {
    return `${ordered[1]}\\${ordered[2]}${inline.slice(ordered[0].length)}`;
  }
  return LEADING_BLOCK_MARKER.test(inline) ? `\\${inline}` : inline;
}
