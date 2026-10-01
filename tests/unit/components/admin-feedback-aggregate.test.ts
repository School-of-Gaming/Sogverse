import { describe, expect, it } from "vitest";
import {
  buildFeedbackView,
  feedbackFilterNames,
  positiveShare,
  weeksBetween,
} from "@/components/admin/feedback/aggregate-feedback";
import {
  NO_FEEDBACK_FILTERS,
  parseFeedbackFilters,
  type FeedbackFilters,
} from "@/components/admin/feedback/feedback-filters";
import {
  feedbackRangeBounds,
  resolveFeedbackRange,
} from "@/components/admin/feedback/feedback-range";
import type {
  AdminFeedbackDataset,
  AdminFeedbackGedu,
  AdminFeedbackGroupRef,
  AdminFeedbackResponse,
  AdminFeedbackSession,
} from "@/services/session-feedback/admin-feedback.contracts";

const CLUB_A: AdminFeedbackGroupRef = {
  groupId: "group-a1",
  groupName: "A1",
  productId: "product-a",
  productName: "Club A",
  productType: "consumer_club",
  isRemote: true,
};
const CLUB_B: AdminFeedbackGroupRef = {
  groupId: "group-b1",
  groupName: "B1",
  productId: "product-b",
  productName: "Club B",
  productType: "municipality_club",
  isRemote: true,
};
const AINO: AdminFeedbackGedu = { id: "gedu-aino", name: "Aino", role: "primary" };
const MIKA: AdminFeedbackGedu = { id: "gedu-mika", name: "Mika", role: "assistant" };

function response(
  overrides: Partial<AdminFeedbackResponse> & Pick<AdminFeedbackResponse, "answers">,
): AdminFeedbackResponse {
  return {
    ...CLUB_A,
    source: "gamer_online",
    sessionDate: "2026-09-08",
    respondent: { id: "gamer-1", name: "Eetu" },
    gedus: [AINO],
    note: "",
    submittedAt: "2026-09-08T16:00:00Z",
    ...overrides,
  };
}

function session(overrides: Partial<AdminFeedbackSession> = {}): AdminFeedbackSession {
  return {
    ...CLUB_A,
    source: "gamer_online",
    sessionDate: "2026-09-08",
    eligibleCount: 4,
    gedus: [AINO],
    ...overrides,
  };
}

function dataset(
  responses: AdminFeedbackResponse[],
  sessions: AdminFeedbackSession[] = [],
): AdminFeedbackDataset {
  return { from: "2026-09-01", to: "2026-09-30", responses, sessions };
}

const filters = (narrowed: Partial<FeedbackFilters>): FeedbackFilters => ({
  ...NO_FEEDBACK_FILTERS,
  ...narrowed,
});

describe("buildFeedbackView", () => {
  it("counts 4 and 5 as positive and keeps the whole distribution", () => {
    const view = buildFeedbackView(
      dataset([
        response({ answers: { learned: 5, fun: 4, geduKind: 3 } }),
        response({ answers: { learned: 1, fun: 2 }, respondent: { id: "gamer-2", name: "Linnea" } }),
      ]),
      "gamer_online",
      NO_FEEDBACK_FILTERS,
    );

    expect(view.totals.overall).toEqual({
      n: 5,
      positive: 2,
      counts: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
    });
    expect(positiveShare(view.totals.overall)).toBeCloseTo(0.4);
    const learned = view.statements.find((statement) => statement.key === "learned");
    expect(learned?.tally).toMatchObject({ n: 2, positive: 1 });
    expect(view.totals.themes["Gedu quality"]).toMatchObject({ n: 1, positive: 0 });
  });

  it("ignores keys the source's catalogue does not ask and values off the scale", () => {
    const view = buildFeedbackView(
      dataset([response({ answers: { retiredQuestion: 5, fun: 7, learned: 0, geduKind: 4 } })]),
      "gamer_online",
      NO_FEEDBACK_FILTERS,
    );

    expect(view.totals.overall.n).toBe(1);
    expect(view.statements.map((statement) => statement.key)).not.toContain("retiredQuestion");
  });

  it("states a positive share as null rather than zero when nothing was answered", () => {
    const view = buildFeedbackView(
      dataset([response({ answers: {}, note: "Only a note." })]),
      "gamer_online",
      NO_FEEDBACK_FILTERS,
    );

    expect(view.totals.responses).toBe(1);
    expect(view.totals.notes).toBe(1);
    expect(positiveShare(view.totals.overall)).toBeNull();
  });

  it("divides responses by the eligible gamers of the same slice", () => {
    const data = dataset(
      [
        response({ answers: { fun: 5 } }),
        response({ ...CLUB_B, answers: { fun: 5 }, respondent: { id: "gamer-3", name: "Onni" } }),
      ],
      [session({ eligibleCount: 4 }), session({ ...CLUB_B, eligibleCount: 10 })],
    );

    expect(buildFeedbackView(data, "gamer_online", NO_FEEDBACK_FILTERS).totals).toMatchObject({
      responses: 2,
      eligible: 14,
    });
    const narrowed = buildFeedbackView(data, "gamer_online", filters({ product: "product-a" }));
    expect(narrowed.totals.eligible).toBe(4);
    expect(narrowed.totals.responseRate).toBeCloseTo(0.25);
  });

  it("withholds the response rate when there is no denominator", () => {
    const noSessions = buildFeedbackView(
      dataset([response({ answers: { fun: 5 } })]),
      "gamer_online",
      NO_FEEDBACK_FILTERS,
    );
    expect(noSessions.totals.eligible).toBe(0);
    expect(noSessions.totals.responseRate).toBeNull();

    const byGamer = buildFeedbackView(
      dataset([response({ answers: { fun: 5 } })], [session()]),
      "gamer_online",
      filters({ gamer: "gamer-1" }),
    );
    expect(byGamer.totals.eligible).toBeNull();
    expect(byGamer.totals.responseRate).toBeNull();
    expect(byGamer.breakdowns.product[0].responseRate).toBeNull();
  });

  it("counts a response toward each Gedu at its session, once each", () => {
    const view = buildFeedbackView(
      dataset(
        [response({ answers: { geduKind: 5 }, gedus: [AINO, MIKA, { ...AINO, role: "substitute" }] })],
        [session({ gedus: [AINO, MIKA], eligibleCount: 3 })],
      ),
      "gamer_online",
      NO_FEEDBACK_FILTERS,
    );

    const gedus = view.breakdowns.gedu;
    expect(gedus.map((row) => [row.id, row.responses, row.eligible])).toEqual([
      ["gedu-aino", 1, 3],
      ["gedu-mika", 1, 3],
    ]);
  });

  it("stacks filters", () => {
    const data = dataset([
      response({ answers: { fun: 5 } }),
      response({ answers: { fun: 5 }, gedus: [MIKA] }),
      response({ ...CLUB_B, answers: { fun: 5 } }),
    ]);

    expect(buildFeedbackView(data, "gamer_online", filters({ gedu: "gedu-aino" })).totals.responses).toBe(2);
    expect(
      buildFeedbackView(data, "gamer_online", filters({ gedu: "gedu-aino", product: "product-b" }))
        .totals.responses,
    ).toBe(1);
    expect(
      buildFeedbackView(data, "gamer_online", filters({ gedu: "gedu-mika", group: "group-b1" }))
        .totals.responses,
    ).toBe(0);
  });

  it("lists a product that ran sessions but heard nothing back", () => {
    const view = buildFeedbackView(
      dataset([response({ answers: { fun: 5 } })], [session(), session({ ...CLUB_B, eligibleCount: 6 })]),
      "gamer_online",
      NO_FEEDBACK_FILTERS,
    );

    expect(view.breakdowns.product.find((row) => row.id === "product-b")).toMatchObject({
      responses: 0,
      eligible: 6,
      responseRate: 0,
    });
  });

  it("buckets by the Monday of the session's week, empty weeks included", () => {
    const view = buildFeedbackView(
      dataset([
        response({ answers: { fun: 5 }, sessionDate: "2026-09-06" }),
        response({ answers: { fun: 2 }, sessionDate: "2026-09-13" }),
        response({ answers: { fun: 4 }, sessionDate: "2026-09-07" }),
      ]),
      "gamer_online",
      NO_FEEDBACK_FILTERS,
    );

    expect(view.weeks.map((week) => [week.weekStart, week.responses])).toEqual([
      ["2026-08-31", 1],
      ["2026-09-07", 2],
      ["2026-09-14", 0],
      ["2026-09-21", 0],
      ["2026-09-28", 0],
    ]);
    expect(view.weeks[1].themes.Fun).toMatchObject({ n: 2, positive: 1 });
  });

  it("orders responses newest session first", () => {
    const view = buildFeedbackView(
      dataset([
        response({ answers: { fun: 5 }, sessionDate: "2026-09-02", note: "old" }),
        response({ answers: { fun: 5 }, sessionDate: "2026-09-20", note: "new" }),
      ]),
      "gamer_online",
      NO_FEEDBACK_FILTERS,
    );

    expect(view.responses.map((row) => row.note)).toEqual(["new", "old"]);
  });
});

describe("weeksBetween", () => {
  it("spans a year boundary in ISO weeks", () => {
    expect(weeksBetween("2025-12-31", "2026-01-12")).toEqual([
      "2025-12-29",
      "2026-01-05",
      "2026-01-12",
    ]);
  });
});

describe("feedbackFilterNames", () => {
  it("finds names anywhere in the dataset, and null for an id it never saw", () => {
    const names = feedbackFilterNames(
      dataset([response({ answers: {} })], [session({ ...CLUB_B, gedus: [MIKA] })]),
      { product: "product-b", group: null, gedu: "gedu-mika", gamer: "gamer-unknown" },
    );

    expect(names).toEqual({ product: "Club B", group: null, gedu: "Mika", gamer: null });
  });
});

describe("parseFeedbackFilters", () => {
  it("reads each dimension's own parameter and drops blanks", () => {
    expect(parseFeedbackFilters({ product: "p", gedu: ["g", "h"], gamer: "", range: "30d" })).toEqual({
      product: "p",
      group: null,
      gedu: "g",
      gamer: null,
    });
  });
});

describe("feedback range", () => {
  it("falls back to 90 days for anything it does not know", () => {
    expect(resolveFeedbackRange("12m")).toBe("12m");
    expect(resolveFeedbackRange("forever")).toBe("90d");
    expect(resolveFeedbackRange(undefined)).toBe("90d");
  });

  it("measures inclusive session days back from today", () => {
    expect(feedbackRangeBounds("30d", "2026-03-01")).toEqual({ from: "2026-01-31", to: "2026-03-01" });
    expect(feedbackRangeBounds("90d", "2026-09-28")).toEqual({ from: "2026-07-01", to: "2026-09-28" });
    expect(feedbackRangeBounds("12m", "2026-02-28")).toEqual({ from: "2025-03-01", to: "2026-02-28" });
  });
});
