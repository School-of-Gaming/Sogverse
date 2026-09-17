import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { GET } from "@/app/api/partner/v1/feedback/route";
import { compareKeys, encodeCursor } from "@/lib/api/partner-cursor.server";
import { partnerFeedbackResponse } from "@/services/partner/partner.contracts";
import type { FetchMock } from "../../mocks/postgrest-fetch";
import {
  PARTNER_TEST_KEY,
  columnFilters,
  emptyTables,
  inList,
  partnerRequest,
  postgrestTables,
  readsOf,
} from "../../mocks/partner-api";

// --- Mocks ---

const db = vi.hoisted(() => ({ fetch: undefined as FetchMock | undefined }));

vi.mock("@/lib/supabase/admin", async () => {
  const { createFetchStubbedClient } = await import("../../mocks/postgrest-fetch");
  return {
    createAdminClient: () => {
      if (db.fetch === undefined) throw new Error("the database stub is not installed");
      return createFetchStubbedClient(db.fetch);
    },
  };
});

// --- Fixtures ---

const PRODUCT = "10000000-0000-4000-8000-000000000001";
const OTHER_PRODUCT = "10000000-0000-4000-8000-000000000002";
const GROUP = "50000000-0000-4000-8000-000000000001";
const OTHER_GROUP = "50000000-0000-4000-8000-000000000002";
const GAMER = "20000000-0000-4000-8000-000000000001";
const GAMER_2 = "20000000-0000-4000-8000-000000000002";
const PARENT = "30000000-0000-4000-8000-000000000001";

const RECORDED_SESSION = "60000000-0000-4000-8000-000000000001";
const NOTE_ONLY_SESSION = "60000000-0000-4000-8000-000000000002";
const MIDNIGHT_SESSION = "60000000-0000-4000-8000-000000000003";

type FeedbackRow = {
  participant_id: string;
  group_id: string;
  session_opens_at: string;
  answers: Record<string, number>;
  note: string;
  exit_reason: string;
  // The embedded facts the scope filters on.
  product_id: string;
  timezone: string;
  role: string;
  programme: boolean;
};

function feedback(overrides: Partial<FeedbackRow> = {}): FeedbackRow {
  return {
    participant_id: GAMER,
    group_id: GROUP,
    // 09:00 in Helsinki (UTC+3 in October), opened five minutes before.
    session_opens_at: "2026-10-19T05:55:00+00:00",
    answers: { learned: 4, fun: 5 },
    note: "I finished my obby!",
    exit_reason: "left",
    product_id: PRODUCT,
    timezone: "Europe/Helsinki",
    role: "gamer",
    programme: true,
    ...overrides,
  };
}

/** In no particular order: the fixture database sorts by the key, as PostgREST would. */
const FEEDBACK: FeedbackRow[] = [
  feedback(),
  // The next week's session in the same group: no session row that day.
  feedback({ session_opens_at: "2026-10-26T06:55:00+00:00", exit_reason: "ended" }),
  // A child who rated nothing and wrote only whitespace: no row.
  feedback({ session_opens_at: "2026-11-02T06:55:00+00:00", answers: {}, note: "  \n" }),
  // A session starting at midnight Helsinki time opened the evening before, in
  // UTC and locally alike; its day is the day it started.
  feedback({ session_opens_at: "2026-11-08T21:55:00+00:00", answers: {}, note: "Hei" }),
  feedback({
    participant_id: GAMER,
    group_id: OTHER_GROUP,
    product_id: OTHER_PRODUCT,
    session_opens_at: "2026-10-19T05:55:00.5+00:00",
    note: "",
  }),
  // A note-only session row that day: /sessions does not serve it.
  feedback({ participant_id: GAMER_2, session_opens_at: "2026-10-12T05:55:00+00:00" }),
  // Out of scope: a parent's row, and a row on a product outside the Programme.
  feedback({ participant_id: PARENT, role: "customer" }),
  feedback({ participant_id: GAMER_2, group_id: OTHER_GROUP, programme: false }),
];

const GROUP_SESSIONS = [
  {
    id: RECORDED_SESSION,
    group_id: GROUP,
    session_date: "2026-10-19",
    starts_at: "2026-10-19T06:00:00+00:00",
    ends_at: "2026-10-19T09:00:00+00:00",
    report: "We built an obby",
  },
  {
    id: NOTE_ONLY_SESSION,
    group_id: GROUP,
    session_date: "2026-10-12",
    starts_at: "2026-10-12T06:00:00+00:00",
    ends_at: "2026-10-12T09:00:00+00:00",
    report: null,
  },
  {
    id: MIDNIGHT_SESSION,
    group_id: GROUP,
    session_date: "2026-11-09",
    starts_at: "2026-11-08T22:00:00+00:00",
    ends_at: "2026-11-09T01:00:00+00:00",
    report: null,
  },
];

const ATTENDANCE = [{ session_id: MIDNIGHT_SESSION, participant_id: GAMER, status: "present" }];

function keyOf(row: FeedbackRow): string[] {
  return [row.participant_id, row.group_id, row.session_opens_at];
}

/**
 * The key a keyset `or` resumes after: its last arm names every key column,
 * so its quoted values are the whole key.
 */
function keysetKey(url: URL): string[] | null {
  const or = url.searchParams.get("or");
  if (or === null) return null;
  const values = [...or.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => match[1]);
  return values.slice(-3);
}

/**
 * The fixture database: `session_feedback` applies the scope, the filters, the
 * keyset, the order and the limit the page read sends, as PostgREST would, so a
 * filter the read forgot to send is a filter the answer does not apply.
 */
function tables(rows: FeedbackRow[] = FEEDBACK) {
  return postgrestTables({
    session_feedback: (url) => {
      const after = keysetKey(url);
      const matches = (row: FeedbackRow) => {
        const equal: [string, string][] = [
          ["participant_id", row.participant_id],
          ["group_id", row.group_id],
          ["group.product_id", row.product_id],
          ["participant.role", row.role],
          [
            "group.product.programme_terms.document_slug",
            row.programme ? "roblox-programme-terms" : "",
          ],
        ];
        const scalar = equal.every(([column, value]) =>
          columnFilters(url, column).every((f) => {
            if (f.op === "eq") return value === f.value;
            throw new Error(`unexpected filter ${column}=${f.op}`);
          }),
        );
        const opened = Date.parse(row.session_opens_at);
        const inWindow = columnFilters(url, "session_opens_at").every((f) => {
          if (f.op === "gte") return opened >= Date.parse(f.value);
          if (f.op === "lt") return opened < Date.parse(f.value);
          throw new Error(`unexpected filter session_opens_at=${f.op}`);
        });
        return scalar && inWindow && (after === null || compareKeys(keyOf(row), after) > 0);
      };
      return rows
        .filter(matches)
        .sort((a, b) => compareKeys(keyOf(a), keyOf(b)))
        .slice(0, Number(url.searchParams.get("limit")))
        .map(({ product_id, timezone, role, programme, ...row }) => ({
          ...row,
          group: {
            product_id,
            product: {
              timezone,
              programme_terms: programme ? [{ document_slug: "roblox-programme-terms" }] : [],
            },
          },
          participant: { role },
        }));
    },
    group_sessions: (url) =>
      GROUP_SESSIONS.filter((row) => inList(url, "group_id").includes(row.group_id)),
    session_attendance: (url) =>
      ATTENDANCE.filter((row) => inList(url, "session_id").includes(row.session_id)),
  });
}

function request(query = ""): Request {
  return partnerRequest("v1/feedback", { query });
}

async function readPage(query = "") {
  const response = await GET(request(query));
  expect(response.status).toBe(200);
  return partnerFeedbackResponse.parse(await response.json());
}

function keys(body: { data: { participant_id: string; group_id: string; session_opened_at: string }[] }) {
  return body.data.map((record) => [
    record.participant_id,
    record.group_id,
    record.session_opened_at,
  ]);
}

/** The page reads — every `session_feedback` request. */
function pageReads(): URL[] {
  return readsOf(db.fetch, "session_feedback");
}

// --- Tests ---

describe("GET /api/partner/v1/feedback", () => {
  beforeEach(() => {
    vi.stubEnv("LYNX_PARTNER_API_KEY", PARTNER_TEST_KEY);
    db.fetch = tables();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    db.fetch = undefined;
  });

  it("maps a row to the documented record, matched to that day's recorded session", async () => {
    const body = await readPage();

    expect(body.data[0]).toEqual({
      participant_id: GAMER,
      group_id: GROUP,
      product_id: PRODUCT,
      session_id: RECORDED_SESSION,
      session_opened_at: "2026-10-19T05:55:00.000Z",
      answers: { learned: 4, fun: 5 },
      note: "I finished my obby!",
      exit_reason: "left",
    });
  });

  it("answers every in-scope row that says something, in key order", async () => {
    const body = await readPage();
    expect(keys(body)).toEqual([
      [GAMER, GROUP, "2026-10-19T05:55:00.000Z"],
      [GAMER, GROUP, "2026-10-26T06:55:00.000Z"],
      [GAMER, GROUP, "2026-11-08T21:55:00.000Z"],
      [GAMER, OTHER_GROUP, "2026-10-19T05:55:00.500Z"],
      [GAMER_2, GROUP, "2026-10-12T05:55:00.000Z"],
    ]);
    expect(body.next_cursor).toBeNull();
  });

  it("keeps a row with only a note or only ratings, and drops one with neither", async () => {
    const body = await readPage();
    const noteOnly = body.data.find((record) => record.note === "Hei");
    expect(noteOnly?.answers).toEqual({});
    const ratingsOnly = body.data.find((record) => record.group_id === OTHER_GROUP);
    expect(ratingsOnly?.note).toBe("");
    expect(body.data.some((record) => record.session_opened_at.startsWith("2026-11-02"))).toBe(
      false,
    );
  });

  it("gives session_id only for a session /sessions serves on the session's own day", async () => {
    const body = await readPage();
    const sessionOn = (opened: string) =>
      body.data.find((record) => record.session_opened_at === opened)?.session_id;

    // No session row that day.
    expect(sessionOn("2026-10-26T06:55:00.000Z")).toBeNull();
    // A session row holding only a staff note is not a session.
    expect(sessionOn("2026-10-12T05:55:00.000Z")).toBeNull();
    // Opened on 8 November, started on 9 November in Helsinki: 9 November's session.
    expect(sessionOn("2026-11-08T21:55:00.000Z")).toBe(MIDNIGHT_SESSION);
  });

  it("scopes the read to gamers on Programme groups and orders it by the key", async () => {
    const body = await readPage();
    expect(body.data.some((record) => record.participant_id === PARENT)).toBe(false);
    expect(
      body.data.some((record) => record.participant_id === GAMER_2 && record.group_id === OTHER_GROUP),
    ).toBe(false);

    const [url] = pageReads();
    expect(url.searchParams.get("select")).toContain(
      "group:product_groups!inner(product_id,product:products!inner(timezone,programme_terms:product_required_consents!inner(document_slug)))",
    );
    expect(url.searchParams.get("select")).toContain("participant:profiles!inner(role)");
    expect(url.searchParams.get("group.product.programme_terms.document_slug")).toBe(
      "eq.roblox-programme-terms",
    );
    expect(url.searchParams.get("participant.role")).toBe("eq.gamer");
    expect(url.searchParams.get("order")).toBe(
      "participant_id.asc,group_id.asc,session_opens_at.asc",
    );
  });

  it("answers an empty last page when there is no feedback", async () => {
    db.fetch = postgrestTables(emptyTables);
    expect(await readPage()).toEqual({ data: [], next_cursor: null });
  });

  it("filters by product, group and participant", async () => {
    expect(keys(await readPage(`?product_id=${OTHER_PRODUCT}`))).toEqual([
      [GAMER, OTHER_GROUP, "2026-10-19T05:55:00.500Z"],
    ]);
    expect(keys(await readPage(`?participant_id=${GAMER_2}`))).toEqual([
      [GAMER_2, GROUP, "2026-10-12T05:55:00.000Z"],
    ]);
    expect(keys(await readPage(`?group_id=${OTHER_GROUP}`))).toHaveLength(1);

    const urls = pageReads();
    expect(urls[0].searchParams.get("group.product_id")).toBe(`eq.${OTHER_PRODUCT}`);
    expect(urls[1].searchParams.get("participant_id")).toBe(`eq.${GAMER_2}`);
    expect(urls[2].searchParams.get("group_id")).toBe(`eq.${OTHER_GROUP}`);
  });

  it("filters on the session's product-local day, inclusive at both ends", async () => {
    // The midnight session opened on 8 November UTC but is 9 November's.
    expect(keys(await readPage("?from=2026-11-09&to=2026-11-09"))).toEqual([
      [GAMER, GROUP, "2026-11-08T21:55:00.000Z"],
    ]);
    expect(keys(await readPage("?from=2026-11-08&to=2026-11-08"))).toEqual([]);
    expect(keys(await readPage("?from=2026-10-12&to=2026-10-19"))).toEqual([
      [GAMER, GROUP, "2026-10-19T05:55:00.000Z"],
      [GAMER, OTHER_GROUP, "2026-10-19T05:55:00.500Z"],
      [GAMER_2, GROUP, "2026-10-12T05:55:00.000Z"],
    ]);

    // The database narrows on the opening instant with room for any zone; the
    // exact day is the build's.
    const [url] = pageReads();
    expect(url.searchParams.getAll("session_opens_at")).toEqual([
      "gte.2026-11-07T00:00:00.000Z",
      "lt.2026-11-12T00:00:00.000Z",
    ]);
  });

  it("pages with next_cursor across the composite key", async () => {
    const seen: string[][] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const body = await readPage(`?limit=2${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...keys(body));
      cursor = body.next_cursor;
      pages += 1;
    } while (cursor !== null);

    expect(pages).toBe(3);
    expect(seen).toEqual(keys(await readPage()));

    // The first page's batch of three held a dropped row, so the page read on
    // past it: strictly after that row's key, in the form the database sent it.
    const resumed = pageReads()[1];
    expect(resumed.searchParams.get("or")).toBe(
      `(participant_id.gt."${GAMER}",and(participant_id.eq."${GAMER}",group_id.gt."${GROUP}"),and(participant_id.eq."${GAMER}",group_id.eq."${GROUP}",session_opens_at.gt."2026-11-02T06:55:00+00:00"))`,
    );
  });

  it("refuses a cursor issued under different filters", async () => {
    const first = await readPage(`?group_id=${GROUP}&limit=1`);
    expect(first.next_cursor).not.toBeNull();
    const response = await GET(request(`?limit=1&cursor=${first.next_cursor}`));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_query");
    expect(body.error.message).toContain("cursor");
  });

  it("refuses another resource's cursor and a malformed one", async () => {
    const foreign = encodeCursor("sessions", { limit: 1 }, RECORDED_SESSION);
    const wrongShape = encodeCursor("feedback", { limit: 1 }, RECORDED_SESSION);
    for (const cursor of [foreign, wrongShape, "not-a-cursor"]) {
      const response = await GET(request(`?limit=1&cursor=${cursor}`));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("invalid_query");
      expect(body.error.message).toContain("cursor");
    }
    expect(pageReads()).toEqual([]);
  });

  it("forbids caching the answer", async () => {
    const response = await GET(request());
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
