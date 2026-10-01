import { describe, expect, it } from "vitest";
import {
  clampSelection,
  defaultSelection,
  feedbackHistory,
  moveSelection,
  parseSelection,
  selectionPeriods,
  stepSelectionEdge,
} from "@/components/admin/feedback/feedback-selection";
import {
  FEEDBACK_ORIGIN_PARAM,
  feedbackPlaceQuery,
  parseFeedbackOrigin,
  placeOfOrigin,
} from "@/components/admin/feedback/feedback-place";

const ID = "0e899757-d789-4fe0-a083-7ef9185e4a72";
/** 1 March to 30 September 2026: 214 days, drawn by the month. */
const HISTORY = { from: "2026-03-01", to: "2026-09-30" };

describe("feedbackHistory", () => {
  it("runs from the first answer to today", () => {
    expect(feedbackHistory("2026-03-01", "2026-09-30")).toEqual(HISTORY);
  });

  it("is never shorter than the default selection", () => {
    expect(feedbackHistory("2026-09-20", "2026-09-30")).toEqual({ from: "2026-07-03", to: "2026-09-30" });
    expect(feedbackHistory(null, "2026-09-30")).toEqual({ from: "2026-07-03", to: "2026-09-30" });
  });
});

describe("parseSelection", () => {
  it("takes a pair of days inside the history as it is", () => {
    expect(parseSelection("2026-07-01", "2026-09-30", HISTORY, 28)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
  });

  it("falls back to the last 90 days for anything it cannot read", () => {
    const fallback = { from: "2026-07-03", to: "2026-09-30" };
    expect(defaultSelection(HISTORY, 28)).toEqual(fallback);
    expect(parseSelection(undefined, undefined, HISTORY, 28)).toEqual(fallback);
    expect(parseSelection("2026-07-01", undefined, HISTORY, 28)).toEqual(fallback);
    expect(parseSelection("yesterday", "2026-09-30", HISTORY, 28)).toEqual(fallback);
    expect(parseSelection("2026-02-30", "2026-09-30", HISTORY, 28)).toEqual(fallback);
    expect(parseSelection("2026-09-30", "2026-07-01", HISTORY, 28)).toEqual(fallback);
    expect(parseSelection(["2026-07-01", "x"], ["2026-09-30"], HISTORY, 28)).toEqual({
      from: "2026-07-01",
      to: "2026-09-30",
    });
  });

  it("clamps a selection reaching outside the history to its edges", () => {
    expect(parseSelection("2025-01-01", "2027-01-01", HISTORY, 28)).toEqual(HISTORY);
  });

  it("grows a selection shorter than a bucket, forward and then back from the end", () => {
    expect(parseSelection("2026-05-10", "2026-05-12", HISTORY, 28)).toEqual({ from: "2026-05-10", to: "2026-06-06" });
    expect(parseSelection("2026-09-29", "2026-09-30", HISTORY, 28)).toEqual({ from: "2026-09-03", to: "2026-09-30" });
    expect(parseSelection("2020-01-01", "2020-01-02", HISTORY, 7)).toEqual({ from: "2026-03-01", to: "2026-03-07" });
  });
});

describe("moving the selection", () => {
  it("slides it whole and stops at the edges", () => {
    const july = { from: "2026-07-01", to: "2026-07-31" };
    expect(moveSelection(july, 10, HISTORY)).toEqual({ from: "2026-07-11", to: "2026-08-10" });
    expect(moveSelection(july, 1000, HISTORY)).toEqual({ from: "2026-08-31", to: "2026-09-30" });
    expect(moveSelection(july, -1000, HISTORY)).toEqual({ from: "2026-03-01", to: "2026-03-31" });
  });

  it("steps an edge by whole buckets, never past the other edge's minimum", () => {
    const summer = { from: "2026-06-15", to: "2026-08-15" };
    expect(stepSelectionEdge(summer, "from", -1, "month", HISTORY)).toEqual({ from: "2026-05-15", to: "2026-08-15" });
    expect(stepSelectionEdge(summer, "to", 1, "month", HISTORY)).toEqual({ from: "2026-06-15", to: "2026-09-15" });
    expect(stepSelectionEdge(summer, "to", 4, "month", HISTORY)).toEqual({ from: "2026-06-15", to: "2026-09-30" });
    expect(stepSelectionEdge(summer, "from", 4, "month", HISTORY)).toEqual({ from: "2026-07-19", to: "2026-08-15" });
    expect(stepSelectionEdge(summer, "to", -1, "week", HISTORY)).toEqual({ from: "2026-06-15", to: "2026-08-08" });
  });

  it("keeps a clamped selection whole when it already fits", () => {
    expect(clampSelection(HISTORY, HISTORY, 28)).toEqual(HISTORY);
  });
});

describe("selectionPeriods", () => {
  it("puts an equal-length period immediately before the selection", () => {
    expect(selectionPeriods({ from: "2026-07-01", to: "2026-09-30" })).toEqual({
      current: { from: "2026-07-01", to: "2026-09-30" },
      previous: { from: "2026-03-31", to: "2026-06-30" },
    });
  });

  it("measures in days, across a leap day", () => {
    // 2027-03-16 .. 2028-03-15 holds 29 February 2028: 366 days.
    expect(selectionPeriods({ from: "2027-03-16", to: "2028-03-15" }).previous).toEqual({
      from: "2026-03-15",
      to: "2027-03-15",
    });
  });
});

describe("feedback places", () => {
  const selection = { from: "2026-07-01", to: "2026-09-30" };

  it("round-trips every origin through the query beside the selection", () => {
    const origins = [
      { kind: "list", dimension: "gedu" },
      { kind: "responses" },
      { kind: "detail", scope: { kind: "group", id: ID } },
    ] as const;
    for (const origin of origins) {
      const query = feedbackPlaceQuery({ view: "detail", scope: { kind: "gamer", id: ID }, origin }, selection);
      expect(query.from).toBe(selection.from);
      expect(query.to).toBe(selection.to);
      expect(parseFeedbackOrigin(query[FEEDBACK_ORIGIN_PARAM])).toEqual(origin);
    }
  });

  it("carries the selection on every place", () => {
    expect(feedbackPlaceQuery({ view: "overview" }, selection)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
  });

  it("returns a gamer opened from what gamers said to that page", () => {
    expect(placeOfOrigin({ kind: "responses" })).toEqual({ view: "responses" });
  });

  it("drops an origin it cannot use", () => {
    expect(parseFeedbackOrigin("teams")).toBeNull();
    expect(parseFeedbackOrigin("group:not-a-uuid")).toBeNull();
    expect(parseFeedbackOrigin(`school:${ID}`)).toBeNull();
    expect(parseFeedbackOrigin(undefined)).toBeNull();
  });
});
