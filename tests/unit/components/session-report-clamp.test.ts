import { describe, expect, it } from "vitest";
import {
  REPORT_BLOCK_GAP_LINES,
  REPORT_CLAMP_LINES,
  REPORT_CLAMP_REM,
  REPORT_ESTIMATED_CHARS_PER_LINE,
  REPORT_HEADING_LINE_COST,
  REPORT_LINE_HEIGHT_REM,
  REPORT_LIST_GAP_LINES,
  estimateReportLines,
  reportOverflows,
} from "@/components/session-feed/report-clamp";

/**
 * The clamp is a CSS length; the only decision in it — *is this report long
 * enough to be worth collapsing* — is this arithmetic, and it is the whole of
 * it. There is no measurement anywhere to correct it, which is why it is worth
 * pinning properly: a report that renders a "Read more" over nothing is a
 * control that reveals two pixels, and one that never offers it hides the end
 * of a write-up with no way back.
 */
describe("estimateReportLines", () => {
  const line = "x".repeat(REPORT_ESTIMATED_CHARS_PER_LINE);

  it("counts a wrapped paragraph by its width, with no gaps inside it", () => {
    expect(estimateReportLines("short")).toBe(1);
    expect(estimateReportLines(`${line}${line}`)).toBe(2);
    expect(estimateReportLines(`${line}${line}${line}`)).toBe(3);
  });

  it("charges a gap between blocks, because the renderer draws one", () => {
    // Three one-line paragraphs are not three lines tall — they are three lines
    // and two `space-y-2` gaps. Ignoring that is the single biggest way a
    // character-count estimate under-reads a real report.
    expect(estimateReportLines("one\n\ntwo\n\nthree")).toBeCloseTo(
      3 + 2 * REPORT_BLOCK_GAP_LINES,
    );
  });

  it("counts list items as blocks of their own, at the tighter list gap", () => {
    // A list's items are set with `space-y-1`, half what the renderer puts
    // between blocks — so charging them the block gap over-read every list.
    expect(estimateReportLines("- one\n- two\n- three")).toBeCloseTo(
      3 + 2 * REPORT_LIST_GAP_LINES,
    );
    expect(REPORT_LIST_GAP_LINES).toBeLessThan(REPORT_BLOCK_GAP_LINES);
  });

  it("charges the full block gap where a list meets what surrounds it", () => {
    // Two boundaries at the list gap, two at the block gap: paragraph→item and
    // item→paragraph are the list's own edges, not gaps inside it.
    expect(
      estimateReportLines("Before.\n\n- one\n- two\n- three\n\nAfter."),
    ).toBeCloseTo(5 + 2 * REPORT_LIST_GAP_LINES + 2 * REPORT_BLOCK_GAP_LINES);
  });

  it("charges the list gap for a numbered list too", () => {
    expect(estimateReportLines("1. one\n2. two")).toBeCloseTo(
      2 + REPORT_LIST_GAP_LINES,
    );
  });

  it("charges a heading its larger line box", () => {
    expect(estimateReportLines("# Title")).toBe(REPORT_HEADING_LINE_COST);
    expect(estimateReportLines("# Title\n\nA paragraph.")).toBeCloseTo(
      REPORT_HEADING_LINE_COST + 1 + REPORT_BLOCK_GAP_LINES,
    );
  });

  it("does not let syntax inflate a line it never occupies", () => {
    // The hashes, the bullet and the emphasis runs are all markers the reader
    // never sees, so counting them would push short reports over the clamp.
    expect(estimateReportLines("###### hi")).toBe(REPORT_HEADING_LINE_COST);
    expect(estimateReportLines("**bold** and *italic*")).toBe(1);
    expect(
      estimateReportLines("[the label](https://example.com/very/long/url)"),
    ).toBe(1);
  });

  it("ignores blank lines rather than counting them as content or as gaps", () => {
    expect(estimateReportLines("\n\n  \n\none\n\n\n")).toBe(1);
  });

  it("says nothing at all about an empty report", () => {
    expect(estimateReportLines("")).toBe(0);
  });
});

describe("reportOverflows", () => {
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
    expect(reportOverflows(REAL_REPORT)).toBe(true);
  });

  it("leaves a two-line report alone", () => {
    expect(
      reportOverflows(
        "# Mob-proofing night\n\nWe lit the paths, walled the gaps and lost nobody to a creeper.",
      ),
    ).toBe(false);
  });

  it("says nothing about an empty report", () => {
    expect(reportOverflows("")).toBe(false);
  });

  /**
   * The boundary, and the reason the gaps are counted at all. Four short
   * paragraphs genuinely fit inside a six-line box; five genuinely do not,
   * because the four gaps between them are worth most of a line and a half. An
   * estimate that counted lines alone would call both of them "under" and clip
   * the fifth paragraph with no way to read it.
   */
  it("turns over between four short paragraphs and five", () => {
    const paragraphs = (n: number) =>
      Array.from({ length: n }, (_, i) => `Paragraph ${i}.`).join("\n\n");
    expect(reportOverflows(paragraphs(4))).toBe(false);
    expect(reportOverflows(paragraphs(5))).toBe(true);
  });

  /**
   * One long paragraph is the other side of the same rule: no gaps, so it gets
   * the whole budget and six lines of prose fit where five paragraphs did not.
   */
  it("gives an unbroken paragraph the whole budget", () => {
    const wide = "x".repeat(REPORT_ESTIMATED_CHARS_PER_LINE);
    expect(reportOverflows(wide.repeat(REPORT_CLAMP_LINES))).toBe(false);
    expect(reportOverflows(wide.repeat(REPORT_CLAMP_LINES + 1))).toBe(true);
  });

});

describe("the clamp's own dimensions", () => {
  it("is a handful of lines — enough to read, short enough to scan past", () => {
    expect(REPORT_CLAMP_LINES).toBeGreaterThanOrEqual(5);
    expect(REPORT_CLAMP_LINES).toBeLessThanOrEqual(6);
  });

  /**
   * The clamped box has to be tall enough to hold what the estimate says fits
   * in it. Both sides derive from the same line box, so this is really a check
   * that the CSS length and the arithmetic have not drifted apart — a clamp a
   * line short would fade out text the estimate had already decided was safe.
   */
  it("is tall enough for the number of lines the estimate lets through", () => {
    expect(REPORT_CLAMP_REM).toBeGreaterThanOrEqual(
      REPORT_CLAMP_LINES * REPORT_LINE_HEIGHT_REM,
    );
    expect(REPORT_LINE_HEIGHT_REM).toBeGreaterThan(1);
  });
});
