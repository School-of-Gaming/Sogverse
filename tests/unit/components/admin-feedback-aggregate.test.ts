import { describe, expect, it } from "vitest";
import {
  buildFeedbackDetail,
  buildFeedbackDimensionList,
  buildFeedbackNotes,
  buildFeedbackOverview,
  bucketUnitFor,
  wilsonInterval,
  type FeedbackPeriods,
} from "@/components/admin/feedback/aggregate-feedback";
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
const CLUB_A2: AdminFeedbackGroupRef = { ...CLUB_A, groupId: "group-a2", groupName: "A2" };
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

/** A 30-day current period and the 30 days before it. */
const PERIODS: FeedbackPeriods = {
  current: { from: "2026-09-01", to: "2026-09-30" },
  previous: { from: "2026-08-02", to: "2026-08-31" },
};

const ALL_FIVE = (rating: number) => ({
  learned: rating,
  fun: rating,
  geduKnowledgeable: rating,
  geduKind: rating,
  groupListens: rating,
});

let nextGamer = 0;

function response(overrides: Partial<AdminFeedbackResponse> = {}): AdminFeedbackResponse {
  nextGamer += 1;
  return {
    ...CLUB_A,
    source: "gamer_online",
    sessionDate: "2026-09-08",
    respondent: { id: `gamer-${nextGamer}`, name: `Gamer ${nextGamer}` },
    gedus: [AINO],
    answers: {},
    note: "",
    countsTowardRate: true,
    submittedAt: "2026-09-08T16:00:00Z",
    ...overrides,
  };
}

/** `count` responses alike but for who gave them. */
function many(count: number, overrides: Partial<AdminFeedbackResponse> = {}): AdminFeedbackResponse[] {
  return Array.from({ length: count }, () => response(overrides));
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
  return { from: PERIODS.previous.from, to: PERIODS.current.to, responses, sessions };
}

describe("wilsonInterval", () => {
  it("matches known 95% values", () => {
    const half = wilsonInterval(0.5, 10);
    expect(half?.lower).toBeCloseTo(0.2366, 4);
    expect(half?.upper).toBeCloseTo(0.7634, 4);
    const eight = wilsonInterval(0.8, 10);
    expect(eight?.lower).toBeCloseTo(0.4902, 4);
    expect(eight?.upper).toBeCloseTo(0.9433, 4);
    const none = wilsonInterval(0, 20);
    expect(none?.lower).toBe(0);
    expect(none?.upper).toBeCloseTo(0.1611, 4);
    expect(wilsonInterval(0.5, 0)).toBeNull();
  });
});

describe("buildFeedbackOverview", () => {
  it("states positive (4–5) and low (1–2) shares of every answer", () => {
    const overview = buildFeedbackOverview(
      dataset([
        response({ answers: { learned: 5, fun: 4, geduKind: 3 } }),
        response({ answers: { learned: 1, fun: 2 } }),
      ]),
      "gamer_online",
      PERIODS,
    );

    expect(overview.headline.current).toMatchObject({
      n: 2,
      answers: 5,
      positive: 2,
      low: 2,
      distribution: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
      tooFew: true,
    });
    expect(overview.headline.current.positiveShare).toBeCloseTo(0.4);
    expect(overview.headline.current.lowShare).toBeCloseTo(0.4);
    const learned = overview.statements.find((line) => line.key === "learned");
    expect(learned?.current).toMatchObject({ n: 2, positive: 1, low: 1 });
    expect(overview.statements.map((line) => line.key)).toEqual([
      "learned",
      "fun",
      "geduKnowledgeable",
      "geduKind",
      "groupListens",
    ]);
  });

  it("ignores keys the catalogue does not ask and values off the scale", () => {
    const overview = buildFeedbackOverview(
      dataset([response({ answers: { retiredQuestion: 5, fun: 7, learned: 0, geduKind: 4 } })]),
      "gamer_online",
      PERIODS,
    );

    expect(overview.headline.current.answers).toBe(1);
    expect(overview.statements.map((line) => line.key)).not.toContain("retiredQuestion");
  });

  it("states shares as null rather than zero when nothing was answered", () => {
    const overview = buildFeedbackOverview(
      dataset([response({ note: "Only a note." })]),
      "gamer_online",
      PERIODS,
    );

    expect(overview.participation.responses).toBe(1);
    expect(overview.headline.current).toMatchObject({
      n: 0,
      positiveShare: null,
      lowShare: null,
      interval: null,
    });
    expect(overview.headline.changePoints).toBeNull();
  });

  it("compares with the previous period in percentage points once both sides are stated", () => {
    const overview = buildFeedbackOverview(
      dataset([
        ...many(8, { answers: { fun: 5 } }),
        ...many(2, { answers: { fun: 1 } }),
        ...many(5, { answers: { fun: 5 }, sessionDate: "2026-08-20" }),
        ...many(5, { answers: { fun: 2 }, sessionDate: "2026-08-20" }),
      ]),
      "gamer_online",
      PERIODS,
    );

    expect(overview.headline.current.positiveShare).toBeCloseTo(0.8);
    expect(overview.headline.previous.positiveShare).toBeCloseTo(0.5);
    expect(overview.headline.changePoints).toBeCloseTo(30);
    const fun = overview.statements.find((line) => line.key === "fun");
    expect(fun?.changePoints).toBeCloseTo(30);
    // A statement nobody answered has nothing to compare.
    expect(overview.statements.find((line) => line.key === "learned")?.changePoints).toBeNull();
  });

  it("withholds the change when the previous period had too few", () => {
    const overview = buildFeedbackOverview(
      dataset([
        ...many(10, { answers: { fun: 5 } }),
        response({ answers: { fun: 1 }, sessionDate: "2026-08-20" }),
      ]),
      "gamer_online",
      PERIODS,
    );

    expect(overview.headline.previous.tooFew).toBe(true);
    expect(overview.headline.changePoints).toBeNull();
  });

  it("divides responses that count toward the rate by the gamers present", () => {
    const overview = buildFeedbackOverview(
      dataset(
        [
          response({ answers: { fun: 5 } }),
          response({ answers: { fun: 5 } }),
          response({ answers: { fun: 5 }, countsTowardRate: false }),
          response({ answers: { fun: 5 }, sessionDate: "2026-08-20" }),
        ],
        [session({ eligibleCount: 4 }), session({ eligibleCount: 6, sessionDate: "2026-08-20" })],
      ),
      "gamer_online",
      PERIODS,
    );

    expect(overview.participation).toEqual({
      responses: 3,
      countedResponses: 2,
      eligible: 4,
      responseRate: 0.5,
    });
  });

  it("states no response rate when nobody could have answered", () => {
    const overview = buildFeedbackOverview(
      dataset([response({ answers: { fun: 5 } })]),
      "gamer_online",
      PERIODS,
    );
    expect(overview.participation.eligible).toBe(0);
    expect(overview.participation.responseRate).toBeNull();
  });

  it("summarises each dimension and the notes without listing them", () => {
    const overview = buildFeedbackOverview(
      dataset(
        [
          ...many(20, { answers: ALL_FIVE(5) }),
          ...many(12, { ...CLUB_B, answers: ALL_FIVE(1), gedus: [MIKA] }),
          response({ answers: { fun: 2 }, note: "Too loud." }),
          response({ answers: { fun: 5 }, note: "Great!" }),
        ],
        [session({ ...CLUB_A2, gedus: [MIKA] })],
      ),
      "gamer_online",
      PERIODS,
    );

    expect(overview.dimensions.product).toEqual({ rows: 2, tooFew: 0, confidentlyBelow: 1 });
    expect(overview.dimensions.group).toEqual({ rows: 3, tooFew: 1, confidentlyBelow: 1 });
    expect(overview.dimensions.gedu).toEqual({ rows: 2, tooFew: 0, confidentlyBelow: 1 });
    expect(overview.notes).toEqual({ total: 2, withLowAnswer: 1 });
  });
});

describe("sparkline buckets", () => {
  it("draws 30 and 90 days by the week and twelve months by the month", () => {
    expect(bucketUnitFor(feedbackRangeBounds("30d", "2026-09-30"))).toBe("week");
    expect(bucketUnitFor(feedbackRangeBounds("90d", "2026-09-30"))).toBe("week");
    expect(bucketUnitFor(feedbackRangeBounds("12m", "2026-09-30"))).toBe("month");
  });

  it("buckets by ISO Monday, marks thin weeks sparse, keeps empty weeks", () => {
    const overview = buildFeedbackOverview(
      dataset([
        ...many(10, { answers: { fun: 5 }, sessionDate: "2026-09-08" }),
        ...many(3, { answers: { fun: 1 }, sessionDate: "2026-09-13" }),
        response({ answers: { fun: 5 }, sessionDate: "2026-09-01" }),
      ]),
      "gamer_online",
      PERIODS,
    );

    expect(overview.bucketUnit).toBe("week");
    expect(
      overview.headline.series.map((point) => [point.start, point.n, point.sparse]),
    ).toEqual([
      ["2026-08-31", 1, true],
      ["2026-09-07", 13, false],
      ["2026-09-14", 0, true],
      ["2026-09-21", 0, true],
      ["2026-09-28", 0, true],
    ]);
    expect(overview.headline.series[1].positiveShare).toBeCloseTo(10 / 13);
    expect(overview.headline.series[2].positiveShare).toBeNull();
  });

  it("buckets a year by calendar month across a year boundary", () => {
    const periods: FeedbackPeriods = {
      current: feedbackRangeBounds("12m", "2026-02-15"),
      previous: { from: "2024-02-16", to: "2025-02-15" },
    };
    const overview = buildFeedbackOverview(
      { from: "2024-02-16", to: "2026-02-15", responses: [response({ answers: { fun: 5 }, sessionDate: "2025-12-31" })], sessions: [] },
      "gamer_online",
      periods,
    );

    expect(overview.bucketUnit).toBe("month");
    const starts = overview.headline.series.map((point) => point.start);
    expect(starts[0]).toBe("2025-02-01");
    expect(starts.at(-1)).toBe("2026-02-01");
    expect(starts).toHaveLength(13);
    expect(overview.headline.series.find((point) => point.start === "2025-12-01")?.n).toBe(1);
  });
});

describe("buildFeedbackDimensionList", () => {
  it("flags a row confidently below only when its whole interval is under the platform", () => {
    const list = buildFeedbackDimensionList(
      dataset([
        ...many(40, { answers: { fun: 5 } }),
        // Club B: 4 of 12 positive — interval top ≈ 0.61, platform ≈ 0.85.
        ...many(4, { ...CLUB_B, answers: { fun: 5 } }),
        ...many(8, { ...CLUB_B, answers: { fun: 1 } }),
      ]),
      "gamer_online",
      PERIODS,
      "product",
    );

    const clubB = list.rows.find((row) => row.id === "product-b");
    expect(list.platform.positiveShare).toBeCloseTo(44 / 52);
    expect(clubB?.overall.current.interval?.upper).toBeLessThan(list.platform.positiveShare ?? 0);
    expect(clubB?.confidentlyBelow).toBe(true);
    expect(clubB?.weakest).toMatchObject({ key: "fun", confidentlyBelow: true });
    expect(clubB?.weakest?.gapPoints).toBeCloseTo((4 / 12 - 44 / 52) * 100);
    expect(list.rows.find((row) => row.id === "product-a")).toMatchObject({
      confidentlyBelow: false,
      weakest: null,
    });
  });

  it("never flags a row with too few answers, however bad", () => {
    const list = buildFeedbackDimensionList(
      dataset([...many(40, { answers: { fun: 5 } }), ...many(9, { ...CLUB_B, answers: { fun: 1 } })]),
      "gamer_online",
      PERIODS,
      "product",
    );

    expect(list.rows.find((row) => row.id === "product-b")).toMatchObject({
      overall: { current: { tooFew: true, n: 9 }, changePoints: null },
      confidentlyBelow: false,
      weakest: null,
    });
  });

  it("is not fooled by many answers from few responses", () => {
    // Nine responses answering all five statements are 45 answers, still too few.
    const list = buildFeedbackDimensionList(
      dataset(many(9, { answers: ALL_FIVE(1) })),
      "gamer_online",
      PERIODS,
      "product",
    );

    expect(list.rows[0].overall.current).toMatchObject({ n: 9, answers: 45, tooFew: true });
  });

  it("sorts worst first by the lower bound, too-few rows last", () => {
    const CLUB_C = { ...CLUB_B, productId: "product-c", productName: "Club C", groupId: "group-c1" };
    const list = buildFeedbackDimensionList(
      dataset(
        [
          ...many(30, { answers: { fun: 5 } }),
          ...many(10, { ...CLUB_B, answers: { fun: 4 } }),
          ...many(10, { ...CLUB_B, answers: { fun: 1 } }),
          ...many(2, { ...CLUB_C, answers: { fun: 1 } }),
        ],
        [session({ ...CLUB_C, productId: "product-d", productName: "Club D" })],
      ),
      "gamer_online",
      PERIODS,
      "product",
    );

    expect(list.rows.map((row) => row.id)).toEqual(["product-b", "product-a", "product-c", "product-d"]);
  });

  it("lists a product that ran sessions but heard nothing back", () => {
    const list = buildFeedbackDimensionList(
      dataset([response({ answers: { fun: 5 } })], [session(), session({ ...CLUB_B, eligibleCount: 6 })]),
      "gamer_online",
      PERIODS,
      "product",
    );

    expect(list.rows.find((row) => row.id === "product-b")).toMatchObject({
      responses: 0,
      eligible: 6,
      responseRate: 0,
      overall: { current: { tooFew: true, positiveShare: null } },
    });
  });

  it("counts a response toward each Gedu at its session, once each", () => {
    const list = buildFeedbackDimensionList(
      dataset(
        [response({ answers: { geduKind: 5 }, gedus: [AINO, MIKA, { ...AINO, role: "substitute" }] })],
        [session({ gedus: [AINO, MIKA], eligibleCount: 3 })],
      ),
      "gamer_online",
      PERIODS,
      "gedu",
    );

    expect(list.rows.map((row) => [row.id, row.responses, row.eligible])).toEqual([
      ["gedu-aino", 1, 3],
      ["gedu-mika", 1, 3],
    ]);
  });

  it("does not open a row from the previous period alone", () => {
    const list = buildFeedbackDimensionList(
      dataset([response({ ...CLUB_B, answers: { fun: 5 }, sessionDate: "2026-08-20" })]),
      "gamer_online",
      PERIODS,
      "product",
    );
    expect(list.rows).toEqual([]);
  });
});

describe("buildFeedbackDetail", () => {
  it("compares a scope with the platform and its own previous period", () => {
    const detail = buildFeedbackDetail(
      dataset([
        ...many(30, { answers: { fun: 5 } }),
        ...many(4, { ...CLUB_B, answers: { fun: 5 } }),
        ...many(8, { ...CLUB_B, answers: { fun: 1 } }),
        ...many(10, { ...CLUB_B, answers: { fun: 5 }, sessionDate: "2026-08-20" }),
      ]),
      "gamer_online",
      PERIODS,
      { kind: "product", id: "product-b" },
    );

    expect(detail.name).toBe("Club B");
    expect(detail.product).toEqual({ id: "product-b", name: "Club B", type: "municipality_club", isRemote: true });
    expect(detail.headline.againstPlatform?.platform.positiveShare).toBeCloseTo(34 / 42);
    expect(detail.headline.againstPlatform?.vsPlatformPoints).toBeCloseTo((4 / 12 - 34 / 42) * 100);
    expect(detail.headline.changePoints).toBeCloseTo((4 / 12 - 1) * 100);
    expect(detail.headline.againstPlatform?.confidentlyBelow).toBe(true);
    const fun = detail.statements.find((line) => line.key === "fun");
    expect(fun?.current.distribution).toEqual({ 1: 8, 2: 0, 3: 0, 4: 0, 5: 4 });
    expect(fun?.againstPlatform?.confidentlyBelow).toBe(true);
    expect(detail.children.groups?.map((row) => row.id)).toEqual(["group-b1"]);
    expect(detail.children.gedus?.map((row) => row.id)).toEqual(["gedu-aino"]);
    expect(detail.children.gamers).toBeNull();
  });

  it("lists a group's gamers alphabetically with a response count and no score", () => {
    const detail = buildFeedbackDetail(
      dataset([
        response({ answers: { fun: 1 }, respondent: { id: "g-o", name: "Onni" } }),
        response({ answers: { fun: 5 }, respondent: { id: "g-a", name: "Aada" } }),
        response({ answers: { fun: 5 }, respondent: { id: "g-o", name: "Onni" }, sessionDate: "2026-09-15" }),
        response({ ...CLUB_A2, answers: { fun: 5 }, respondent: { id: "g-x", name: "Ilmari" } }),
      ]),
      "gamer_online",
      PERIODS,
      { kind: "group", id: "group-a1" },
    );

    expect(detail.children).toEqual({
      groups: null,
      gedus: null,
      gamers: [
        { id: "g-a", name: "Aada", responses: 1 },
        { id: "g-o", name: "Onni", responses: 2 },
      ],
    });
  });

  it("narrows a Gedu to their sessions and breaks them down by group", () => {
    const detail = buildFeedbackDetail(
      dataset(
        [
          response({ answers: { fun: 5 }, gedus: [AINO, MIKA] }),
          response({ ...CLUB_A2, answers: { fun: 5 }, gedus: [MIKA] }),
          response({ answers: { fun: 5 } }),
        ],
        [session({ gedus: [MIKA], eligibleCount: 5 })],
      ),
      "gamer_online",
      PERIODS,
      { kind: "gedu", id: "gedu-mika" },
    );

    expect(detail.name).toBe("Mika");
    expect(detail.participation).toMatchObject({ responses: 2, eligible: 5 });
    expect(detail.children.groups?.map((row) => row.id).sort()).toEqual(["group-a1", "group-a2"]);
    expect(detail.children.gedus).toBeNull();
  });

  it("gives a gamer no response rate and no platform figure, notes low-answer first, responses newest first", () => {
    const gamer = { id: "g-1", name: "Eetu" };
    const detail = buildFeedbackDetail(
      dataset(
        [
          response({ respondent: gamer, answers: { fun: 5 }, note: "newest", sessionDate: "2026-09-20" }),
          response({ respondent: gamer, answers: { fun: 1 }, note: "low", sessionDate: "2026-09-02" }),
          response({ respondent: gamer, answers: { fun: 4 }, sessionDate: "2026-09-10" }),
        ],
        [session()],
      ),
      "gamer_online",
      PERIODS,
      { kind: "gamer", id: "g-1" },
    );

    expect(detail.participation).toEqual({ responses: 3, countedResponses: 3, eligible: null, responseRate: null });
    expect(detail.headline.againstPlatform).toBeNull();
    expect(detail.statements.length).toBeGreaterThan(0);
    expect(detail.statements.every((line) => line.againstPlatform === null)).toBe(true);
    expect(detail.notes.map((note) => [note.response.note, note.withLowAnswer])).toEqual([
      ["low", true],
      ["newest", false],
    ]);
    expect(detail.responses.map((row) => row.sessionDate)).toEqual(["2026-09-20", "2026-09-10", "2026-09-02"]);
    expect(detail.children).toEqual({ groups: null, gedus: null, gamers: null });
  });
});

describe("buildFeedbackNotes", () => {
  it("lists notes newest first and filters to those that came with a low answer", () => {
    const data = dataset([
      response({ answers: { fun: 5, learned: 2 }, note: "mixed", sessionDate: "2026-09-03" }),
      response({ answers: { fun: 5 }, note: "happy", sessionDate: "2026-09-21" }),
      response({ answers: { fun: 3 }, note: "  " }),
      response({ answers: { fun: 1 }, note: "last period", sessionDate: "2026-08-20" }),
      response({ answers: { retired: 1 }, note: "retired key is not low", sessionDate: "2026-09-10" }),
    ]);

    const all = buildFeedbackNotes(data, "gamer_online", PERIODS, { lowAnswerOnly: false });
    expect(all.summary).toEqual({ total: 3, withLowAnswer: 1 });
    expect(all.notes.map((note) => note.response.note)).toEqual(["happy", "retired key is not low", "mixed"]);

    const low = buildFeedbackNotes(data, "gamer_online", PERIODS, { lowAnswerOnly: true });
    expect(low.notes.map((note) => note.response.note)).toEqual(["mixed"]);
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
