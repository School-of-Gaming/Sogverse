/**
 * How much of a session report the feed shows before it asks.
 *
 * Reports run 500–1500 characters and a club runs for a year, so a feed that
 * rendered every one of them in full would be a wall of prose with the dates —
 * the thing a gedu is actually scanning for — buried inside it. Clamping to a
 * few lines keeps the feed a feed; expanding in place keeps the report a report.
 *
 * **The decision is taken once, from the source text, and never revised.** A
 * report is painted by a server that cannot measure anything, so anything the
 * first frame depends on has to be decidable without a browser. The obvious fix
 * — seed from an estimate, correct from a measurement after mount — is worse
 * than it looks: a borderline report then grows its "Read more" a frame after
 * the reader is already looking at the text it belongs to, and everything below
 * the card jumps down as it lands. There is no measurement anywhere in this
 * file or in the component that uses it. The arithmetic below is the whole
 * decision, it is pure, and the server and the browser run exactly the same one.
 *
 * **What it costs.** An estimate that is never corrected is sometimes wrong, and
 * the two ways of being wrong are both accepted here:
 *
 * - a control that reveals only a line or two, on a report the estimate put
 *   just over the clamp; or
 * - a last line clipped by the fade with no control offered, on one it put just
 *   under.
 *
 * Both are quiet, local and stable. Neither moves anything on the page. The
 * tolerance is roughly **one line either way** on a report near the boundary,
 * and that is bought deliberately in exchange for a page that never reflows.
 */

/** Lines of a report the feed shows collapsed. */
export const REPORT_CLAMP_LINES = 6;

/**
 * One line box of report body copy, in rem: `text-sm` (0.875rem) at
 * `leading-relaxed` (1.625). Kept as the product of its two factors so it stays
 * readable as "the type scale times the leading" rather than as a magic decimal.
 */
export const REPORT_LINE_HEIGHT_REM = 0.875 * 1.625;

/** The collapsed height of a report body, in rem. */
export const REPORT_CLAMP_REM = REPORT_CLAMP_LINES * REPORT_LINE_HEIGHT_REM;

/* ------------------------------------------------------------------ */
/*  The estimate                                                       */
/* ------------------------------------------------------------------ */

/**
 * How many characters of report body fit on one rendered line.
 *
 * The feed's column is two thirds of a capped desktop workspace, less the
 * timeline rail and the card's padding — a little under 800 CSS pixels at
 * `text-sm`, which is around 105 characters of average Latin prose. Lines break
 * at word boundaries, though, so a wrapped paragraph only ever *fills* about
 * nine tenths of the width it is given, and counting the theoretical maximum
 * would systematically under-count the lines a paragraph actually takes.
 */
export const REPORT_ESTIMATED_CHARS_PER_LINE = 95;

/**
 * The same number for a heading, which renders a size or two up and therefore
 * fits proportionally fewer characters on its line.
 */
export const REPORT_ESTIMATED_HEADING_CHARS_PER_LINE = 72;

/**
 * What one line of a heading costs against the body-copy line budget: its own
 * larger line box, plus the small top padding the renderer gives every heading.
 */
export const REPORT_HEADING_LINE_COST = 1.25;

/**
 * The gap between two blocks, as a fraction of a body line.
 *
 * The renderer separates blocks with `space-y-2`, which is half a rem against a
 * line box of about 1.42rem. It is the single biggest thing a naive
 * character-count estimate misses: six one-line paragraphs are not six lines
 * tall, they are six lines plus five gaps — comfortably past a six-line clamp —
 * while one six-line paragraph fits exactly.
 */
export const REPORT_BLOCK_GAP_LINES = 0.35;

/** A markdown line that renders as a heading rather than as body copy. */
const HEADING_LINE = /^\s*#{1,6}\s+/;

/**
 * Roughly how many body-copy lines a report's markdown renders to.
 *
 * Every non-blank source line is one rendered block — a paragraph, a heading, a
 * list item — because that is what both the editor's serialiser and the
 * fixtures emit; each one wraps according to its own width, and each boundary
 * between two of them costs a gap. The result is deliberately fractional: the
 * gaps are a real part of the height and rounding them away is exactly the
 * error this exists to correct.
 *
 * Markdown syntax is stripped before anything is counted — the hashes, the
 * bullets, the emphasis runs and a link's target never reach the rendered
 * width, so counting them would inflate short blocks into long ones.
 */
export function estimateReportLines(markdown: string): number {
  let lines = 0;
  let blocks = 0;

  for (const rawLine of markdown.split("\n")) {
    const isHeading = HEADING_LINE.test(rawLine);
    const text = stripMarkdownSyntax(rawLine);
    if (text.length === 0) continue;

    blocks += 1;
    lines += isHeading
      ? Math.ceil(text.length / REPORT_ESTIMATED_HEADING_CHARS_PER_LINE) *
        REPORT_HEADING_LINE_COST
      : Math.ceil(text.length / REPORT_ESTIMATED_CHARS_PER_LINE);
  }

  return lines + Math.max(blocks - 1, 0) * REPORT_BLOCK_GAP_LINES;
}

/**
 * Whether a report is long enough to be worth collapsing — the one decision,
 * taken from the source text and identical on the server and in the browser.
 */
export function reportOverflows(markdown: string): boolean {
  return estimateReportLines(markdown) > REPORT_CLAMP_LINES;
}

/**
 * A markdown line reduced to the text a reader actually sees on it.
 *
 * Only the leading block markers and the inline emphasis runs matter here —
 * they are what would otherwise inflate a short heading or a bolded phrase into
 * a line and a half of imagined width.
 */
function stripMarkdownSyntax(line: string): string {
  return line
    .replace(HEADING_LINE, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();
}
