import { describe, expect, it } from "vitest";
import {
  feedbackRangePeriods,
  feedbackReadSpan,
} from "@/components/admin/feedback/feedback-range";
import {
  feedbackPlaceQuery,
  parseFeedbackNotesFilter,
  parseFeedbackOrigin,
  placeOfOrigin,
} from "@/components/admin/feedback/feedback-place";

const ID = "0e899757-d789-4fe0-a083-7ef9185e4a72";

describe("feedbackRangePeriods", () => {
  it("puts an equal-length period immediately before the current one", () => {
    expect(feedbackRangePeriods("30d", "2026-03-01")).toEqual({
      current: { from: "2026-01-31", to: "2026-03-01" },
      previous: { from: "2026-01-01", to: "2026-01-30" },
    });
    expect(feedbackRangePeriods("90d", "2026-09-28")).toEqual({
      current: { from: "2026-07-01", to: "2026-09-28" },
      previous: { from: "2026-04-02", to: "2026-06-30" },
    });
  });

  it("measures twelve months in days, across a leap day", () => {
    const { current, previous } = feedbackRangePeriods("12m", "2028-03-15");
    // 2027-03-16 .. 2028-03-15 holds 29 February 2028: 366 days.
    expect(current).toEqual({ from: "2027-03-16", to: "2028-03-15" });
    expect(previous).toEqual({ from: "2026-03-15", to: "2027-03-15" });
  });

  it("reads one span from the start of the previous period to today", () => {
    expect(feedbackReadSpan(feedbackRangePeriods("30d", "2026-03-01"))).toEqual({
      from: "2026-01-01",
      to: "2026-03-01",
    });
  });
});

describe("feedback places", () => {
  it("round-trips every origin through the query", () => {
    const origins = [
      { kind: "list", dimension: "gedu" },
      { kind: "notes", lowAnswerOnly: true },
      { kind: "notes", lowAnswerOnly: false },
      { kind: "detail", scope: { kind: "group", id: ID } },
    ] as const;
    for (const origin of origins) {
      const query = feedbackPlaceQuery(
        { view: "detail", scope: { kind: "gamer", id: ID }, origin },
        "90d",
      );
      expect(parseFeedbackOrigin(query.from)).toEqual(origin);
    }
  });

  it("returns a gamer opened from the notes to the notes as they were filtered", () => {
    expect(placeOfOrigin({ kind: "notes", lowAnswerOnly: true })).toEqual({ view: "notes", lowAnswerOnly: true });
    expect(placeOfOrigin({ kind: "notes", lowAnswerOnly: false })).toEqual({ view: "notes", lowAnswerOnly: false });
  });

  it("drops an origin it cannot use", () => {
    expect(parseFeedbackOrigin("teams")).toBeNull();
    expect(parseFeedbackOrigin("group:not-a-uuid")).toBeNull();
    expect(parseFeedbackOrigin(`school:${ID}`)).toBeNull();
    expect(parseFeedbackOrigin(undefined)).toBeNull();
  });

  it("carries the range only when it is not the default", () => {
    expect(feedbackPlaceQuery({ view: "overview" }, "90d")).toEqual({});
    expect(feedbackPlaceQuery({ view: "overview" }, "12m")).toEqual({ range: "12m" });
  });

  it("shows only low-answer notes unless asked for all", () => {
    expect(parseFeedbackNotesFilter(undefined)).toBe(true);
    const all = feedbackPlaceQuery({ view: "notes", lowAnswerOnly: false }, "90d");
    expect(parseFeedbackNotesFilter(all.show)).toBe(false);
  });
});
