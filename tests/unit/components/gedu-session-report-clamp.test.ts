import { describe, expect, it } from "vitest";
import {
  REPORT_CLAMP_LINES,
  REPORT_CLAMP_REM,
  REPORT_CLAMP_TOLERANCE_PX,
  REPORT_LINE_HEIGHT_REM,
  reportOverflows,
} from "@/components/gedu/session-feed/report-clamp";

/**
 * The clamp itself is a CSS length and a measured height; the only decision in
 * it — *is this report long enough to be worth collapsing* — is this comparison,
 * and it is the half that can be wrong without anything looking broken. A clamp
 * that offers "Read more" on a report with nothing hidden is a control that
 * reveals two pixels; one that never offers it hides the end of a write-up with
 * no way back.
 */
describe("reportOverflows", () => {
  const CLAMP = 136;

  it("offers to expand a report taller than its clamp", () => {
    expect(reportOverflows(CLAMP * 3, CLAMP)).toBe(true);
  });

  it("leaves a report that fits alone", () => {
    expect(reportOverflows(40, CLAMP)).toBe(false);
    expect(reportOverflows(CLAMP, CLAMP)).toBe(false);
  });

  it("absorbs a few pixels of rounding rather than offering a no-op reveal", () => {
    // A list's last item carrying a hair of bottom margin, a heading's leading
    // rounding up — none of that is hidden text, and a control that reveals it
    // is worse than the two pixels it was protecting.
    expect(reportOverflows(CLAMP + REPORT_CLAMP_TOLERANCE_PX, CLAMP)).toBe(false);
    expect(reportOverflows(CLAMP + REPORT_CLAMP_TOLERANCE_PX + 1, CLAMP)).toBe(
      true,
    );
  });

  it("refuses to decide before the clamp has been measured", () => {
    // First render, before the layout effect: no measurement means no offer,
    // rather than an offer computed against zero that would appear on every
    // report and then vanish.
    expect(reportOverflows(500, 0)).toBe(false);
    expect(reportOverflows(0, 0)).toBe(false);
  });
});

describe("the clamp's own dimensions", () => {
  it("is a handful of lines — enough to read, short enough to scan past", () => {
    expect(REPORT_CLAMP_LINES).toBeGreaterThanOrEqual(5);
    expect(REPORT_CLAMP_LINES).toBeLessThanOrEqual(6);
  });

  it("derives its height from the line box rather than a magic number", () => {
    expect(REPORT_CLAMP_REM).toBeCloseTo(
      REPORT_CLAMP_LINES * REPORT_LINE_HEIGHT_REM,
      10,
    );
  });
});
