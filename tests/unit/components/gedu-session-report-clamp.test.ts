import { describe, expect, it } from "vitest";
import {
  REPORT_CLAMP_LINES,
  REPORT_CLAMP_REM,
  REPORT_CLAMP_TOLERANCE_PX,
  REPORT_ESTIMATED_CHARS_PER_LINE,
  REPORT_LINE_HEIGHT_REM,
  estimateReportLines,
  reportLikelyOverflows,
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
    // Measurement is the authority once it exists; an unmeasured clamp hands
    // the decision back to the caller rather than answering against zero. What
    // the caller does with it until then is the estimate's job, below.
    expect(reportOverflows(500, 0)).toBe(false);
    expect(reportOverflows(0, 0)).toBe(false);
  });
});

/**
 * The estimate is what a *server* decides with, and a server cannot measure
 * anything. Getting it roughly right is what keeps a report's "Read more" in
 * the frame the page is first painted in instead of a hydration later — and
 * getting its *bias* right is what keeps the correction from ever taking a
 * control back off the screen.
 */
describe("estimateReportLines", () => {
  const line = "x".repeat(REPORT_ESTIMATED_CHARS_PER_LINE);

  it("counts a block per paragraph and a line per wrap", () => {
    expect(estimateReportLines("short")).toBe(1);
    expect(estimateReportLines(`${line}${line}`)).toBe(2);
    expect(estimateReportLines("one\n\ntwo\n\nthree")).toBe(3);
  });

  it("counts list items and headings as their own lines", () => {
    expect(estimateReportLines("- one\n- two\n- three")).toBe(3);
    expect(estimateReportLines("# Title\n\nA paragraph.")).toBe(2);
  });

  it("does not let syntax inflate a line it never occupies", () => {
    // The hashes, the bullet and the emphasis runs are all markers the reader
    // never sees, so counting them would push short reports over the clamp.
    expect(estimateReportLines("###### hi")).toBe(1);
    expect(estimateReportLines("**bold** and *italic*")).toBe(1);
    expect(estimateReportLines("[the label](https://example.com/very/long/url)"))
      .toBe(1);
  });

  it("ignores blank lines rather than counting them as content", () => {
    expect(estimateReportLines("\n\n  \n\none\n\n\n")).toBe(1);
  });
});

describe("reportLikelyOverflows", () => {
  /** A dated title and eight paragraphs — the shape a real report takes. */
  const REAL_REPORT = `# 9.2.2026 – The castle\n\n${[
    "We spent the whole of this one on the castle, and it is finally the shape everyone has been arguing about since before the break.",
    "The towers went up first. Aino and Väinö took one each and agreed a height beforehand, which is the first time that has happened without me suggesting it.",
    "Elias worked on the gate all evening. It opens on a lever hidden behind the left pillar, and he tested it about forty times before letting anybody near it.",
    "Linnéa and Siiri built the great hall in the middle, and spent most of the session on the floor pattern rather than on the walls.",
    "Oskar and Emil took the outer wall, and had a long and serious disagreement about whether a castle needs a moat.",
    "Hilda spent the session lighting the whole thing, which is the job nobody volunteers for and the reason it looks finished.",
    "We ended with everyone standing on top of the north tower looking down at it.",
    "Thank you all — the castle stays in the world, so do go and walk around it during the week.",
  ].join("\n\n")}`;

  it("claims the overflow on a full write-up", () => {
    expect(reportLikelyOverflows(REAL_REPORT)).toBe(true);
  });

  it("leaves a two-line report alone", () => {
    expect(
      reportLikelyOverflows(
        "# Mob-proofing night\n\nWe lit the paths, walled the gaps and lost nobody to a creeper.",
      ),
    ).toBe(false);
  });

  /**
   * The bias, which is the whole reason there is a margin at all. A report the
   * estimate cannot call must come out `false`: the measurement can then *add*
   * a control a frame later, which nudges the page down by one small row. The
   * other direction — painting a fade and a control over a report with nothing
   * hidden, then removing both — is a visual lie followed by a jump, and must
   * not be reachable.
   */
  it("declines the call rather than guessing, right at the clamp", () => {
    const atTheClamp = Array.from(
      { length: REPORT_CLAMP_LINES },
      (_, i) => `Paragraph ${i}.`,
    ).join("\n\n");
    expect(estimateReportLines(atTheClamp)).toBe(REPORT_CLAMP_LINES);
    expect(reportLikelyOverflows(atTheClamp)).toBe(false);
  });

  it("says nothing about an empty report", () => {
    expect(reportLikelyOverflows("")).toBe(false);
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
