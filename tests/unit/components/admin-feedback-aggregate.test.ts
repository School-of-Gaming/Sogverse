import { describe, expect, it } from "vitest";
import {
  buildFeedbackDetail,
  buildFeedbackDimensionList,
  buildFeedbackOverview,
  buildFeedbackResponses,
  buildFeedbackTimeline,
  bucketUnitFor,
  feedbackHistory,
} from "@/components/admin/feedback/aggregate-feedback";
import {
  allFive as ALL_FIVE,
  FEEDBACK_CLUB_A2 as CLUB_A2,
  FEEDBACK_CLUB_B as CLUB_B,
  FEEDBACK_GEDU_AINO as AINO,
  FEEDBACK_GEDU_MIKA as MIKA,
  feedbackDataset as dataset,
  feedbackResponse as response,
  feedbackResponses as many,
  feedbackSession as session,
} from "../../mocks/admin-feedback";

/** One month of history, drawn by the week. */
const SEPTEMBER = { from: "2026-09-01", to: "2026-09-30" };

describe("buildFeedbackOverview", () => {
  it("states positive (4–5) and low (1–2) shares of every answer", () => {
    const overview = buildFeedbackOverview(
      dataset([
        response({ answers: { learned: 5, fun: 4, geduKind: 3 } }),
        response({ answers: { learned: 1, fun: 2 } }),
      ]),
      "gamer_online",
    );

    expect(overview.headline).toMatchObject({
      n: 2,
      answers: 5,
      positive: 2,
      low: 2,
      distribution: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 },
    });
    expect(overview.headline.positiveShare).toBeCloseTo(0.4);
    expect(overview.headline.lowShare).toBeCloseTo(0.4);
    const learned = overview.statements.find((line) => line.key === "learned");
    expect(learned?.figure).toMatchObject({ n: 2, positive: 1, low: 1 });
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
    );

    expect(overview.headline.answers).toBe(1);
    expect(overview.statements.map((line) => line.key)).not.toContain("retiredQuestion");
  });

  it("states shares as null rather than zero when nothing was answered", () => {
    const overview = buildFeedbackOverview(
      dataset([response({ note: "Only a note." })]),
      "gamer_online",
    );

    expect(overview.participation.responses).toBe(1);
    expect(overview.headline).toMatchObject({
      n: 0,
      positiveShare: null,
      lowShare: null,
    });
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
    );

    // Every day of the history counts: August as much as September.
    expect(overview.participation).toEqual({
      responses: 4,
      countedResponses: 3,
      eligible: 10,
      responseRate: 0.3,
    });
  });

  it("states no response rate when nobody could have answered", () => {
    const overview = buildFeedbackOverview(
      dataset([response({ answers: { fun: 5 } })]),
      "gamer_online",
    );
    expect(overview.participation.eligible).toBe(0);
    expect(overview.participation.responseRate).toBeNull();
  });

  it("summarises each dimension and what gamers said without listing them", () => {
    const overview = buildFeedbackOverview(
      dataset(
        [
          ...many(20, { answers: ALL_FIVE(5) }),
          ...many(2, { ...CLUB_B, answers: ALL_FIVE(1), gedus: [MIKA] }),
          response({ answers: { fun: 2 }, note: "Too loud." }),
          response({ answers: { fun: 5 }, note: "Great!" }),
        ],
        [session({ ...CLUB_A2, gedus: [MIKA] })],
      ),
      "gamer_online",
    );

    // Club B, its group and Mika are below; A2 heard nothing back, so is not.
    expect(overview.dimensions.product).toEqual({ rows: 2, belowPlatform: 1 });
    expect(overview.dimensions.group).toEqual({ rows: 3, belowPlatform: 1 });
    expect(overview.dimensions.gedu).toEqual({ rows: 2, belowPlatform: 1 });
    // The two Club B responses are low, "Too loud." is low with a note, "Great!" is a note.
    expect(overview.responses).toEqual({ total: 24, worthReading: 4 });
  });
});

describe("buildFeedbackTimeline", () => {
  it("draws up to about six months by the week and anything longer by the month", () => {
    expect(bucketUnitFor({ from: "2026-04-01", to: "2026-09-30" })).toBe("week");
    expect(bucketUnitFor({ from: "2026-03-01", to: "2026-09-30" })).toBe("month");
  });

  it("buckets by ISO Monday, clips the end buckets to the history, gaps only an empty week", () => {
    const timeline = buildFeedbackTimeline(
      dataset([
        ...many(10, { answers: { fun: 5 }, sessionDate: "2026-09-08" }),
        ...many(3, { answers: { fun: 1 }, sessionDate: "2026-09-13" }),
        response({ answers: { fun: 5 }, sessionDate: "2026-09-01" }),
      ]),
      "gamer_online",
      SEPTEMBER,
      null,
    );

    expect(timeline.unit).toBe("week");
    expect(timeline.platform).toBeNull();
    expect(
      timeline.points.map((point) => [point.start, point.end, point.n, point.positiveShare]),
    ).toEqual([
      ["2026-09-01", "2026-09-06", 1, 1],
      ["2026-09-07", "2026-09-13", 13, 10 / 13],
      ["2026-09-14", "2026-09-20", 0, null],
      ["2026-09-21", "2026-09-27", 0, null],
      ["2026-09-28", "2026-09-30", 0, null],
    ]);
  });

  it("buckets a long history by calendar month across a year boundary", () => {
    const history = { from: "2025-02-16", to: "2026-02-15" };
    const timeline = buildFeedbackTimeline(
      { ...history, responses: [response({ answers: { fun: 5 }, sessionDate: "2025-12-31" })], sessions: [] },
      "gamer_online",
      history,
      null,
    );

    expect(timeline.unit).toBe("month");
    const starts = timeline.points.map((point) => point.start);
    expect(starts[0]).toBe("2025-02-16");
    expect(starts[1]).toBe("2025-03-01");
    expect(starts.at(-1)).toBe("2026-02-01");
    expect(starts).toHaveLength(13);
    expect(timeline.points.find((point) => point.start === "2025-12-01")?.n).toBe(1);
  });

  it("draws a scope against the platform, and a gamer alone", () => {
    const data = dataset([
      ...many(3, { answers: { fun: 5 }, sessionDate: "2026-09-08" }),
      response({ ...CLUB_B, answers: { fun: 1 }, sessionDate: "2026-09-08" }),
      response({ respondent: { id: "gamer-x", name: "X" }, answers: { fun: 1 }, sessionDate: "2026-09-08" }),
    ]);
    const group = buildFeedbackTimeline(data, "gamer_online", SEPTEMBER, { kind: "group", id: CLUB_B.groupId });
    expect(group.points[1].positiveShare).toBe(0);
    expect(group.platform?.[1].positiveShare).toBe(3 / 5);

    const gamer = buildFeedbackTimeline(data, "gamer_online", SEPTEMBER, { kind: "gamer", id: "gamer-x" });
    expect(gamer.points[1].n).toBe(1);
    expect(gamer.platform).toBeNull();
  });

  it("runs the history from the first day with an answer or a session to today", () => {
    const today = "2026-09-30";
    expect(
      feedbackHistory(dataset([response({ sessionDate: "2026-09-08" }), response({ sessionDate: "2026-08-03" })]), "gamer_online", today),
    ).toEqual({ from: "2026-08-03", to: today });
    expect(
      feedbackHistory(dataset([response({ sessionDate: "2026-09-08" })], [session({ sessionDate: "2026-07-14" })]), "gamer_online", today),
    ).toEqual({ from: "2026-07-14", to: today });
    expect(feedbackHistory(dataset([]), "gamer_online", today)).toEqual({ from: today, to: today });
  });
});

describe("buildFeedbackDimensionList", () => {
  it("flags a row below average when its share is under the platform's, naming its weakest statement", () => {
    const list = buildFeedbackDimensionList(
      dataset([
        ...many(40, { answers: { fun: 5, learned: 5 } }),
        // Club B: fun 4 of 12 positive, learned 10 of 12 — both under the platform.
        ...many(4, { ...CLUB_B, answers: { fun: 5, learned: 5 } }),
        ...many(6, { ...CLUB_B, answers: { fun: 1, learned: 5 } }),
        ...many(2, { ...CLUB_B, answers: { fun: 1, learned: 1 } }),
      ]),
      "gamer_online",
      "product",
    );

    const clubB = list.rows.find((row) => row.id === "product-b");
    expect(clubB?.belowPlatform).toBe(true);
    expect(clubB?.weakest?.key).toBe("fun");
    expect(clubB?.weakest?.gapPoints).toBeCloseTo((4 / 12 - 44 / 52) * 100);
    expect(list.rows.find((row) => row.id === "product-a")).toMatchObject({
      belowPlatform: false,
      weakest: null,
    });
  });

  it("judges a row of a single answer like any other", () => {
    const list = buildFeedbackDimensionList(
      dataset([...many(40, { answers: { fun: 5 } }), response({ ...CLUB_B, answers: { fun: 1 } })]),
      "gamer_online",
      "product",
    );

    expect(list.rows.find((row) => row.id === "product-b")).toMatchObject({
      overall: { n: 1, positiveShare: 0 },
      belowPlatform: true,
      weakest: { key: "fun" },
    });
  });

  it("sorts worst first by positive share, ties by name, rows with no answers last", () => {
    const CLUB_C = { ...CLUB_B, productId: "product-c", productName: "Club C", groupId: "group-c1" };
    const CLUB_AB = { ...CLUB_B, productId: "product-ab", productName: "Club AB", groupId: "group-ab1" };
    const list = buildFeedbackDimensionList(
      dataset(
        [
          ...many(30, { answers: { fun: 5 } }),
          ...many(10, { ...CLUB_B, answers: { fun: 4 } }),
          ...many(10, { ...CLUB_B, answers: { fun: 1 } }),
          response({ ...CLUB_AB, answers: { fun: 5 } }),
          response({ ...CLUB_AB, answers: { fun: 2 } }),
          ...many(2, { ...CLUB_C, answers: { fun: 1 } }),
        ],
        [session({ ...CLUB_C, productId: "product-d", productName: "Club D" })],
      ),
      "gamer_online",
      "product",
    );

    expect(list.rows.map((row) => row.id)).toEqual([
      "product-c",
      "product-ab",
      "product-b",
      "product-a",
      "product-d",
    ]);
  });

  it("lists a product that ran sessions but heard nothing back, unjudged", () => {
    const list = buildFeedbackDimensionList(
      dataset([response({ answers: { fun: 5 } })], [session(), session({ ...CLUB_B, eligibleCount: 6 })]),
      "gamer_online",
      "product",
    );

    expect(list.rows.find((row) => row.id === "product-b")).toMatchObject({
      responses: 0,
      eligible: 6,
      responseRate: 0,
      overall: { positiveShare: null },
      belowPlatform: false,
      weakest: null,
    });
  });

  it("counts a response toward each Gedu at its session, once each", () => {
    const list = buildFeedbackDimensionList(
      dataset(
        [response({ answers: { geduKind: 5 }, gedus: [AINO, MIKA, { ...AINO, role: "substitute" }] })],
        [session({ gedus: [AINO, MIKA], eligibleCount: 3 })],
      ),
      "gamer_online",
      "gedu",
    );

    expect(list.rows.map((row) => [row.id, row.responses, row.eligible])).toEqual([
      ["gedu-aino", 1, 3],
      ["gedu-mika", 1, 3],
    ]);
  });

});

describe("buildFeedbackDetail", () => {
  it("compares a scope with the platform", () => {
    const detail = buildFeedbackDetail(
      dataset([
        ...many(30, { answers: { fun: 5 } }),
        ...many(4, { ...CLUB_B, answers: { fun: 5 } }),
        ...many(8, { ...CLUB_B, answers: { fun: 1 } }),
      ]),
      "gamer_online",
      { kind: "product", id: "product-b" },
    );

    expect(detail.name).toBe("Club B");
    expect(detail.product).toEqual({ id: "product-b", name: "Club B", type: "municipality_club", isRemote: true });
    expect(detail.againstPlatform?.platform.positiveShare).toBeCloseTo(34 / 42);
    expect(detail.againstPlatform?.vsPlatformPoints).toBeCloseTo((4 / 12 - 34 / 42) * 100);
    expect(detail.againstPlatform?.belowPlatform).toBe(true);
    const fun = detail.statements.find((line) => line.key === "fun");
    expect(fun?.figure.distribution).toEqual({ 1: 8, 2: 0, 3: 0, 4: 0, 5: 4 });
    expect(fun?.againstPlatform?.belowPlatform).toBe(true);
    // Nobody answered "learned": no gap, no flag.
    const learned = detail.statements.find((line) => line.key === "learned");
    expect(learned?.againstPlatform).toMatchObject({ vsPlatformPoints: null, belowPlatform: false });
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
      { kind: "gedu", id: "gedu-mika" },
    );

    expect(detail.name).toBe("Mika");
    expect(detail.participation).toMatchObject({ responses: 2, eligible: 5 });
    expect(detail.children.groups?.map((row) => row.id).sort()).toEqual(["group-a1", "group-a2"]);
    expect(detail.children.gedus).toBeNull();
  });

  it("gives a gamer no response rate and no platform figure, and their responses newest first", () => {
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
      { kind: "gamer", id: "g-1" },
    );

    expect(detail.participation).toEqual({ responses: 3, countedResponses: 3, eligible: null, responseRate: null });
    expect(detail.againstPlatform).toBeNull();
    expect(detail.statements.length).toBeGreaterThan(0);
    expect(detail.statements.every((line) => line.againstPlatform === null)).toBe(true);
    expect(detail.responses.all.map((row) => row.sessionDate)).toEqual(["2026-09-20", "2026-09-10", "2026-09-02"]);
    expect(detail.responses.worthReading.map((row) => row.note)).toEqual(["low", "newest"]);
    expect(detail.children).toEqual({ groups: null, gedus: null, gamers: null });
  });
});

describe("buildFeedbackResponses", () => {
  const data = dataset([
    response({ answers: { fun: 5 }, note: "note, older", sessionDate: "2026-09-04" }),
    response({ answers: { fun: 2 }, note: "", sessionDate: "2026-09-05" }),
    response({ answers: { fun: 5, learned: 2 }, note: "low + note, older", sessionDate: "2026-09-03" }),
    response({ answers: { fun: 5 }, note: "note, newer", sessionDate: "2026-09-21" }),
    response({ answers: { fun: 1 }, note: "low + note, newer", sessionDate: "2026-09-18" }),
    response({ answers: { learned: 1 }, note: "", sessionDate: "2026-09-19" }),
    response({ answers: { fun: 3 }, note: "  ", sessionDate: "2026-09-25" }),
    response({ answers: { retired: 1 }, note: "", sessionDate: "2026-09-10" }),
  ]);
  const { responses } = buildFeedbackResponses(data, "gamer_online");
  const labelOf = (row: { note: string; sessionDate: string }) => row.note || row.sessionDate;

  it("orders what is worth reading: low with a note, then low, then a note, newest first in each", () => {
    expect(responses.worthReading.map(labelOf)).toEqual([
      "low + note, newer",
      "low + note, older",
      "2026-09-19",
      "2026-09-05",
      "note, newer",
      "note, older",
    ]);
  });

  it("leaves out a blank note, a middling answer and a key the catalogue no longer asks", () => {
    expect(responses.worthReading.map(labelOf)).not.toContain("2026-09-25");
    expect(responses.worthReading.map(labelOf)).not.toContain("2026-09-10");
  });

  it("lists every response newest first", () => {
    expect(responses.all.map((row) => row.sessionDate)).toEqual([
      "2026-09-25",
      "2026-09-21",
      "2026-09-19",
      "2026-09-18",
      "2026-09-10",
      "2026-09-05",
      "2026-09-04",
      "2026-09-03",
    ]);
  });
});
