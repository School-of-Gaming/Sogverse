/**
 * How much of a session report the feed shows before it asks.
 *
 * Reports run 500–1500 characters and a club runs for a year, so a feed that
 * rendered every one of them in full would be a wall of prose with the dates —
 * the thing a gedu is actually scanning for — buried inside it. Clamping to a
 * few lines keeps the feed a feed; expanding in place keeps the report a report.
 *
 * The numbers live here rather than inside the component because the decision of
 * *whether a report is long enough to be worth clamping* is a pure comparison,
 * and a pure comparison is the part worth pinning in a test. The component's job
 * is only to measure the two heights and animate between them.
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

/**
 * Slack, in CSS pixels, before a report counts as overflowing.
 *
 * Without it a report that ends a few pixels past the clamp — a list's last item
 * carrying a hair of bottom margin, a heading's leading rounding up — would grow
 * a "Read more" that reveals nothing, which is worse than the two pixels it was
 * protecting. Roughly a third of a line: enough to absorb rounding, far short of
 * hiding a line of actual text.
 */
export const REPORT_CLAMP_TOLERANCE_PX = 8;

/**
 * Whether a report is long enough to be worth collapsing.
 *
 * Both heights are measured from the DOM by the caller — the natural height of
 * the rendered markdown, and the height the clamp actually resolved to — so this
 * never has to guess at a root font size, and it keeps working under browser
 * zoom or a user font-size preference.
 */
export function reportOverflows(
  naturalHeightPx: number,
  clampHeightPx: number,
): boolean {
  if (clampHeightPx <= 0) return false;
  return naturalHeightPx > clampHeightPx + REPORT_CLAMP_TOLERANCE_PX;
}

/* ------------------------------------------------------------------ */
/*  The first-paint estimate                                           */
/* ------------------------------------------------------------------ */

/**
 * How many characters of report body fit on one rendered line, assumed
 * **generously**.
 *
 * A server has no layout: it cannot measure anything, so the only way a report
 * can carry its "Read more" in the very first painted frame is to decide from
 * the source text. This is the one number that decision turns on, and it is
 * deliberately set at the wide end of what the reading column actually gives —
 * a gedu surface is a desktop surface, and the feed's column is two thirds of a
 * wide page at `text-sm`.
 *
 * Wide, because the two ways of being wrong are not equally bad. Under-counting
 * lines means a borderline report gains its control when the measurement lands,
 * which nudges the page down by one small row. Over-counting means a report
 * that fits is painted with a fade over its last line and a control that
 * reveals nothing — a visual lie, and a click that does nothing — and then loses
 * both. So the estimate only claims a report overflows when even a generous
 * line can't fit it.
 */
export const REPORT_ESTIMATED_CHARS_PER_LINE = 100;

/**
 * Lines the estimate must exceed the clamp by before it claims an overflow.
 *
 * The margin is what keeps the estimate on the safe side of its own error: a
 * report the estimate puts at exactly the clamp's height is precisely the case
 * it cannot call, so it declines to, and the measurement decides a frame later.
 */
export const REPORT_ESTIMATE_MARGIN_LINES = 2;

/**
 * Roughly how many lines a report's markdown renders to.
 *
 * Blocks (paragraphs, headings, list items) each start a line of their own and
 * then wrap; everything else about markdown — emphasis, links, the heading
 * markers themselves — is syntax that never reaches the rendered width, so it is
 * stripped before counting. Inter-block spacing is deliberately *not* counted:
 * ignoring it can only lower the estimate, which is the direction this is
 * allowed to be wrong in.
 *
 * Pure and exported so the one judgement in the first-paint path is pinned in a
 * test rather than buried in a component.
 */
export function estimateReportLines(markdown: string): number {
  let lines = 0;
  for (const block of markdown.split(/\n\s*\n/)) {
    for (const rawLine of block.split("\n")) {
      const text = stripMarkdownSyntax(rawLine);
      if (text.length === 0) continue;
      lines += Math.ceil(text.length / REPORT_ESTIMATED_CHARS_PER_LINE);
    }
  }
  return lines;
}

/**
 * Whether a report is long enough that it is worth painting its clamp
 * affordances before anything has been measured.
 *
 * This is the render-time stand-in for `reportOverflows`, and it is only ever
 * consulted until the real measurement arrives. It exists because a report is
 * server-rendered long before any JavaScript runs: a control that only appears
 * once the browser has measured is a control that lands after the reader is
 * already looking at the text it belongs to.
 */
export function reportLikelyOverflows(markdown: string): boolean {
  return (
    estimateReportLines(markdown) >
    REPORT_CLAMP_LINES + REPORT_ESTIMATE_MARGIN_LINES
  );
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
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();
}
