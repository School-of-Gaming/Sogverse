/**
 * How much of a session report the feed shows before it asks.
 *
 * Reports run 500–1500 characters and a club runs for a year, so a feed that
 * rendered every one of them in full would be a wall of prose with the dates —
 * the thing a gedu is actually scanning for — buried inside it. Clamping to a
 * few lines keeps the feed a feed; expanding in place keeps the report a report.
 *
 * **The numbers below are calibrated against the surface that clamps**, which is
 * the gedu's workspace column: a capped desktop width, less the timeline rail
 * and the card's padding. A feed that renders its reports whole never consults
 * any of this, so a narrower column elsewhere does not put the estimate wrong —
 * it puts it out of play.
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
 * The renderer's type and spacing, in rem, as far as the estimate needs them.
 * They restate the one markdown style in `src/components/ui/markdown.tsx` and
 * have to move with it: body copy is `text-base` (1rem) at `leading-relaxed`
 * (1.625), blocks sit `mt-4` apart, list items `space-y-1`.
 */
const BODY_SIZE_REM = 1;
const BODY_LEADING = 1.625;
const BLOCK_GAP_REM = 1;
const LIST_GAP_REM = 0.25;

/**
 * One line box of report body copy, in rem. Kept as the product of its two
 * factors so it stays readable as "the type scale times the leading" rather
 * than as a magic decimal.
 */
export const REPORT_LINE_HEIGHT_REM = BODY_SIZE_REM * BODY_LEADING;

/** The collapsed height of a report body, in rem. */
export const REPORT_CLAMP_REM = REPORT_CLAMP_LINES * REPORT_LINE_HEIGHT_REM;

/* ------------------------------------------------------------------ */
/*  The estimate                                                       */
/* ------------------------------------------------------------------ */

/**
 * How many characters of report body fit on one rendered line.
 *
 * The feed's column is two thirds of a capped desktop workspace, less the
 * timeline rail and the card's padding — a little under 800 CSS pixels, which
 * at 16px is around 92 characters of average Latin prose. Lines break at word
 * boundaries, though, so a wrapped paragraph only ever *fills* about nine
 * tenths of the width it is given, and counting the theoretical maximum would
 * systematically under-count the lines a paragraph actually takes.
 */
export const REPORT_ESTIMATED_CHARS_PER_LINE = 83;

/**
 * What a heading at one level costs, all in body lines so it adds straight
 * onto the paragraph count: the characters that fit on one of its lines
 * (fewer than body copy, in proportion to its size), the height of one of
 * those lines, and the margin it takes above itself beyond the ordinary block
 * gap.
 */
function headingCost(sizeRem: number, leading: number, marginTopRem: number) {
  return {
    charsPerLine: Math.floor(
      (REPORT_ESTIMATED_CHARS_PER_LINE * BODY_SIZE_REM) / sizeRem,
    ),
    lineCost: (sizeRem * leading) / REPORT_LINE_HEIGHT_REM,
    extraTopLines: (marginTopRem - BLOCK_GAP_REM) / REPORT_LINE_HEIGHT_REM,
  };
}

/**
 * Each heading level's cost, keyed by its markdown level. The sizes restate the
 * renderer's: 24px at leading 1.3, then 20px and 18px at `leading-snug`
 * (1.375); the margins are `mt-8`, `mt-6` and `mt-6`. A deeper level is outside
 * the feed's subset and unwraps to body copy.
 */
export const REPORT_HEADING_COSTS = {
  1: headingCost(1.5, 1.3, 2),
  2: headingCost(1.25, 1.375, 1.5),
  3: headingCost(1.125, 1.375, 1.5),
} as const;

/**
 * The gap between two blocks, as a fraction of a body line.
 *
 * It is the single biggest thing a naive character-count estimate misses: six
 * one-line paragraphs are not six lines tall, they are six lines plus five
 * gaps — comfortably past a six-line clamp — while one six-line paragraph fits
 * exactly.
 */
export const REPORT_BLOCK_GAP_LINES = BLOCK_GAP_REM / REPORT_LINE_HEIGHT_REM;

/**
 * The gap between two items of the *same* list, which is far tighter than the
 * one between blocks: a list's boundaries with whatever sits either side of it
 * take the block gap, its items only the list gap.
 *
 * Charging every list item the full block gap was the estimate's one systematic
 * over-count, and lists are where it bit hardest — a write-up that opens with a
 * title and then lists five things was credited with lines it does not occupy,
 * which is enough to offer a "Read more" over almost nothing. Splitting the two
 * keeps the error inside the tolerance this file documents rather than
 * spending most of it on the commonest shape a report takes.
 */
export const REPORT_LIST_GAP_LINES = LIST_GAP_REM / REPORT_LINE_HEIGHT_REM;

/** A markdown line that renders as a heading rather than as body copy. */
const HEADING_LINE = /^\s*(#{1,6})\s+/;

/** A markdown line that renders as one item of a bulleted or numbered list. */
const LIST_ITEM_LINE = /^\s*(?:[-*+]|\d+\.)\s+/;

/**
 * Roughly how many body-copy lines a report's markdown renders to.
 *
 * Every non-blank source line is one rendered block — a paragraph, a heading, a
 * list item — because that is what both the editor's serialiser and the
 * fixtures emit; each one wraps according to its own width, and each boundary
 * between two of them costs a gap. **Which** gap depends on what sits either
 * side of it: two items of the same list are set tighter than two blocks are,
 * so the boundary is charged the list gap only when both of its sides are list
 * items. The result is deliberately fractional: the gaps are a real part of the
 * height and rounding them away is exactly the error this exists to correct.
 *
 * Markdown syntax is stripped before anything is counted — the hashes, the
 * bullets, the emphasis runs and a link's target never reach the rendered
 * width, so counting them would inflate short blocks into long ones.
 */
export function estimateReportLines(markdown: string): number {
  let lines = 0;
  let gaps = 0;
  /** `null` until the first rendered block, so nothing is charged above it. */
  let previousWasListItem: boolean | null = null;

  for (const rawLine of markdown.split("\n")) {
    const isListItem = LIST_ITEM_LINE.test(rawLine);
    const text = stripMarkdownSyntax(rawLine);
    if (text.length === 0) continue;

    const isFirstBlock = previousWasListItem === null;
    if (!isFirstBlock) {
      gaps +=
        previousWasListItem && isListItem
          ? REPORT_LIST_GAP_LINES
          : REPORT_BLOCK_GAP_LINES;
    }
    previousWasListItem = isListItem;

    const heading = headingLevel(rawLine);
    if (heading === null) {
      lines += Math.ceil(text.length / REPORT_ESTIMATED_CHARS_PER_LINE);
    } else {
      const cost = REPORT_HEADING_COSTS[heading];
      lines += Math.ceil(text.length / cost.charsPerLine) * cost.lineCost;
      // The renderer zeroes the first block's top margin.
      if (!isFirstBlock) lines += cost.extraTopLines;
    }
  }

  return lines + gaps;
}

/**
 * The markdown level of a line the feed renders as a heading, or `null` for
 * body copy — including a level deeper than the subset, which unwraps to text.
 */
function headingLevel(line: string): 1 | 2 | 3 | null {
  const hashes = HEADING_LINE.exec(line)?.[1].length;
  return hashes === 1 || hashes === 2 || hashes === 3 ? hashes : null;
}

/**
 * Whether a report is long enough to be worth collapsing — the one decision,
 * taken from the source text and identical on the server and in the browser.
 */
export function reportOverflows(markdown: string): boolean {
  return estimateReportLines(markdown) > REPORT_CLAMP_LINES;
}

/**
 * Whether a stored report field actually carries a write-up.
 *
 * `null`, `""` and a field holding nothing but whitespace are the same answer:
 * nobody has written anything. The editor trims on the way out and collapses an
 * emptied field back to `null`, so the middle two are transient — but a value
 * can still arrive here untrimmed (a draft mid-save, a row written before that
 * collapse existed), and a space is not a session report.
 *
 * **It lives in the shared module because every surface has to answer it the
 * same way,** and each of them asks it more than once: a feed decides whether a
 * row is a card or a quiet dashed line, and the row itself decides whether to
 * render a body. Two subtly different copies within one feed is all it takes to
 * draw a card-weight rail marker beside a line that says "no write-up" — which
 * is exactly what an untrimmed emptiness test did here. The builders pass the
 * field through untrimmed so that this stays the only place the question is
 * answered on the client; the dashboard's SQL twin uses `btrim` with an
 * explicit whitespace list to give the same answer server-side.
 */
export function hasReport(report: string | null): boolean {
  return report !== null && report.trim().length > 0;
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
    .replace(LIST_ITEM_LINE, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();
}
