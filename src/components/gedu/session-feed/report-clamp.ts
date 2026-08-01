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
