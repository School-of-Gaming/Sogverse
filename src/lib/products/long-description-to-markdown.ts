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
 * a break the admin typed is visible on the page and has to survive.
 *
 * **Except that a line whose escaping is load-bearing begins its own
 * paragraph.** Converted copy is not a write-once artefact: the column it lands
 * in is edited in a rich-text editor, and *that* editor re-derives the markdown
 * from the document on every save. Its serialiser only applies the line-start
 * half of its escaping at the start of a paragraph — a line reached over a hard
 * break is treated as mid-paragraph and its backslashes are not written back.
 * So an escape that only exists to stop a line opening a list, a quote or a
 * heading survives the page but not the first unrelated save: the text acquires
 * formatting nobody typed, and the original is unrecoverable because the
 * conversion rewrites the column in place. Starting a fresh paragraph puts the
 * line where the serialiser does re-escape it, and the round trip is then
 * stable.
 *
 * **What that costs, where it fires: a paragraph gap instead of a line break.**
 * A hand-typed dash list inside one block used to render as tight lines and now
 * renders with the spacing between paragraphs. That is why the rule is keyed to
 * the escaping rather than applied to every line — lines that need no escape
 * keep their hard break, so the tight spacing survives everywhere it safely
 * can.
 *
 * **One escape is beyond rescuing here, and it is recorded rather than
 * pretended away.** A backslash before entity-shaped text — `AT&amp;T`, where
 * the `&` would otherwise decode — is not re-derived by that serialiser at
 * *any* position, because a bare `&` is not on the list of characters it
 * escapes. Such a line still opens its own paragraph, which is the most this
 * end can do; the first save through the editor nonetheless collapses it to
 * `AT&T`. The fix would have to be at the editing end, and no product's copy
 * currently contains one.
 *
 * **What is lost, deliberately, because markdown cannot represent it.** Three
 * things, all stated here because none is recoverable afterwards:
 *
 * 1. **Leading indentation is stripped from every line.** Four or more leading
 *    spaces open an indented code block, which would render the line in a
 *    monospace box — a much bigger change than losing the spaces. Trailing
 *    whitespace goes with it, since two trailing spaces are themselves a hard
 *    break.
 * 2. **Newlines inside a heading are flattened to single spaces.** An ATX
 *    heading is one line by definition; the alternative is splitting one
 *    heading into several, which invents structure.
 * 3. **A run of blank lines inside one block collapses to a single paragraph
 *    break.** `whitespace-pre-line` renders each of those blank lines as its
 *    own empty line today, so three of them are three lines of vertical space
 *    and after the conversion they are one paragraph gap. The page gets tighter
 *    where an admin was spacing copy out by hand. Markdown has no way to say
 *    "two blank lines" — consecutive ones are one break by definition — so the
 *    alternatives are inventing an empty paragraph per line or accepting the
 *    collapse, and this accepts the collapse.
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
  //
  // A line whose escaping only holds at a paragraph start opens a run of its
  // own instead of continuing the previous one — see the note on the exported
  // function for what a hard break does to those backslashes, and what the
  // extra paragraph gap buys.
  const paragraphs: string[][] = [];
  let run: string[] = [];

  function endRun() {
    if (run.length > 0) {
      paragraphs.push(run);
      run = [];
    }
  }

  for (const rawLine of text.split("\n")) {
    const line = escapeLine(rawLine);
    if (line === null) {
      endRun();
      continue;
    }
    if (line.ownParagraph) endRun();
    run.push(line.text);
  }
  endRun();

  return paragraphs.map((lines) => lines.join("\\\n")).join("\n\n");
}

/** One line of paragraph text, made inert, or `null` for a blank one. */
interface EscapedLine {
  text: string;
  /**
   * Whether the escaping this line carries is the kind that has to sit at the
   * start of a paragraph to be read back correctly.
   *
   * Read off the passes below as they run rather than restated as a second list
   * of dangerous prefixes: the two would drift, and the one that drifted
   * silently is this one — a marker added to the line-start pass but missed
   * here would still be escaped on the way out and still lose its backslash on
   * the first save.
   */
  ownParagraph: boolean;
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
function escapeLine(rawLine: string): EscapedLine | null {
  const trimmed = rawLine.trim();
  if (trimmed === "") return null;
  // The inline pass, watching for the one escape it makes that a mid-paragraph
  // position loses: a backslash before an entity-shaped `&`. (A paragraph start
  // does not actually rescue that one either — see the exported function's note
  // — but the line is no less fragile for it, and the split is what this end
  // can do about it.)
  let escapedEntity = false;
  const inline = trimmed.replace(INLINE_SYNTAX, (match) => {
    if (match === "&") escapedEntity = true;
    return `\\${match}`;
  });
  const ordered = LEADING_ORDERED_MARKER.exec(inline);
  if (ordered !== null) {
    return {
      text: `${ordered[1]}\\${ordered[2]}${inline.slice(ordered[0].length)}`,
      ownParagraph: true,
    };
  }
  if (LEADING_BLOCK_MARKER.test(inline)) {
    return { text: `\\${inline}`, ownParagraph: true };
  }
  return { text: inline, ownParagraph: escapedEntity };
}
