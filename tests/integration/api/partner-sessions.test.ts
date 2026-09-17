import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { GET } from "@/app/api/partner/v1/sessions/route";
import { encodeCursor } from "@/lib/api/partner-cursor.server";
import { partnerSessionsResponse } from "@/services/partner/partner.contracts";
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

const REPORTED = "60000000-0000-4000-8000-000000000001";
const NOTE_ONLY = "60000000-0000-4000-8000-000000000002";
const MARKED = "60000000-0000-4000-8000-000000000003";
const BLANK_REPORT = "60000000-0000-4000-8000-000000000004";
const OTHER_GROUPS = "60000000-0000-4000-8000-000000000005";

const IMAGE_FIRST = "70000000-0000-4000-8000-000000000009";
const IMAGE_SECOND = "70000000-0000-4000-8000-000000000001";

type SessionRow = {
  id: string;
  group_id: string;
  product_id: string;
  session_date: string;
  starts_at: string;
  ends_at: string;
  report: string | null;
};

function session(id: string, overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id,
    group_id: GROUP,
    product_id: PRODUCT,
    session_date: "2026-10-19",
    starts_at: "2026-10-19T09:00:00+00:00",
    ends_at: "2026-10-19T12:00:00+00:00",
    report: null,
    ...overrides,
  };
}

const SESSIONS: SessionRow[] = [
  session(REPORTED, { report: "We built an obby", session_date: "2026-10-12" }),
  // A row made only to hold a staff note or a photograph: not a session.
  session(NOTE_ONLY, { session_date: "2026-10-13" }),
  session(MARKED, { session_date: "2026-10-19" }),
  session(BLANK_REPORT, { report: "  \n ", session_date: "2026-10-20" }),
  session(OTHER_GROUPS, {
    group_id: OTHER_GROUP,
    product_id: OTHER_PRODUCT,
    report: "Another group's day",
    session_date: "2026-10-26",
  }),
];

const ATTENDANCE = [
  { session_id: MARKED, participant_id: GAMER, status: "present" },
  { session_id: MARKED, participant_id: GAMER_2, status: "absent" },
];

/**
 * The fixture database: `group_sessions` applies the filters, keyset and limit
 * the page read sends, as PostgREST would, so a filter the read forgot to send is
 * a filter the answer does not apply.
 */
function tables(sessions: SessionRow[] = SESSIONS) {
  return postgrestTables({
    group_sessions: (url) => {
      const matches = (row: SessionRow) => {
        const checks: [string, string][] = [
          ["id", row.id],
          ["group_id", row.group_id],
          ["group.product_id", row.product_id],
          ["session_date", row.session_date],
        ];
        return checks.every(([column, value]) =>
          columnFilters(url, column).every((f) => {
            if (f.op === "eq") return value === f.value;
            if (f.op === "gt") return value > f.value;
            if (f.op === "gte") return value >= f.value;
            if (f.op === "lte") return value <= f.value;
            throw new Error(`unexpected filter ${column}=${f.op}`);
          }),
        );
      };
      return sessions
        .filter(matches)
        .slice(0, Number(url.searchParams.get("limit")))
        .map(({ product_id, ...row }) => ({
          ...row,
          group: {
            product_id,
            product: { programme_terms: [{ document_slug: "roblox-programme-terms" }] },
          },
        }));
    },
    session_attendance: (url) =>
      ATTENDANCE.filter((row) => inList(url, "session_id").includes(row.session_id)),
    group_session_images: (url) =>
      inList(url, "session_id").includes(MARKED)
        ? [
            // In the order they were added, which is not id order.
            { id: IMAGE_FIRST, session_id: MARKED, width: 1920, height: 1080 },
            { id: IMAGE_SECOND, session_id: MARKED, width: 1080, height: 1920 },
          ]
        : [],
  });
}

function request(query = ""): Request {
  return partnerRequest("v1/sessions", { query });
}

async function readPage(query = "") {
  const response = await GET(request(query));
  expect(response.status).toBe(200);
  return partnerSessionsResponse.parse(await response.json());
}

function ids(body: { data: { id: string }[] }): string[] {
  return body.data.map((record) => record.id);
}

/** The page reads — every `group_sessions` request. */
function pageReads(): URL[] {
  return readsOf(db.fetch, "group_sessions");
}

// --- Tests ---

describe("GET /api/partner/v1/sessions", () => {
  beforeEach(() => {
    vi.stubEnv("LYNX_PARTNER_API_KEY", PARTNER_TEST_KEY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    db.fetch = tables();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    db.fetch = undefined;
  });

  it("maps a recorded session to the documented record", async () => {
    const body = await readPage();

    expect(body.data[1]).toEqual({
      id: MARKED,
      product_id: PRODUCT,
      group_id: GROUP,
      starts_at: "2026-10-19T09:00:00.000Z",
      ends_at: "2026-10-19T12:00:00.000Z",
      attendance: [
        { participant_id: GAMER, status: "present" },
        { participant_id: GAMER_2, status: "absent" },
      ],
      images: [
        {
          id: IMAGE_FIRST,
          url: `https://project.supabase.co/storage/v1/object/public/session-images/${IMAGE_FIRST}.jpg`,
          width: 1920,
          height: 1080,
        },
        {
          id: IMAGE_SECOND,
          url: `https://project.supabase.co/storage/v1/object/public/session-images/${IMAGE_SECOND}.jpg`,
          width: 1080,
          height: 1920,
        },
      ],
    });
    expect(body.data[0]).toMatchObject({ id: REPORTED, attendance: [], images: [] });

    // Photographs in the order they were added, as every report renders them.
    const imageRead = readsOf(db.fetch, "group_session_images").at(0);
    expect(imageRead?.searchParams.get("order")).toBe("session_id.asc,created_at.asc,id.asc");
  });

  it("returns only sessions with a written report or an attendance mark", async () => {
    const body = await readPage();
    expect(ids(body)).toEqual([REPORTED, MARKED, OTHER_GROUPS]);
    expect(body.next_cursor).toBeNull();
  });

  it("scopes the read to Programme groups and orders it by id", async () => {
    await readPage();

    const [url] = pageReads();
    expect(url.searchParams.get("select")).toContain(
      "group:product_groups!inner(product_id,product:products!inner(programme_terms:product_required_consents!inner(document_slug)))",
    );
    expect(url.searchParams.get("group.product.programme_terms.document_slug")).toBe(
      "eq.roblox-programme-terms",
    );
    expect(url.searchParams.get("order")).toBe("id.asc");
  });

  it("answers an empty last page when nothing is recorded", async () => {
    db.fetch = postgrestTables(emptyTables);
    expect(await readPage()).toEqual({ data: [], next_cursor: null });
  });

  it("filters by product and by group", async () => {
    expect(ids(await readPage(`?product_id=${OTHER_PRODUCT}`))).toEqual([OTHER_GROUPS]);
    expect(ids(await readPage(`?group_id=${GROUP}`))).toEqual([REPORTED, MARKED]);

    const urls = pageReads();
    expect(urls[0].searchParams.get("group.product_id")).toBe(`eq.${OTHER_PRODUCT}`);
    expect(urls[1].searchParams.get("group_id")).toBe(`eq.${GROUP}`);
  });

  it("filters on the session's product-local date, inclusive at both ends", async () => {
    const body = await readPage("?from=2026-10-12&to=2026-10-19");
    expect(ids(body)).toEqual([REPORTED, MARKED]);

    const [url] = pageReads();
    expect(url.searchParams.getAll("session_date")).toEqual(["gte.2026-10-12", "lte.2026-10-19"]);
  });

  it("pages with next_cursor across sessions that are not recorded", async () => {
    const first = await readPage("?limit=1");
    expect(ids(first)).toEqual([REPORTED]);
    expect(first.next_cursor).not.toBeNull();

    const second = await readPage(`?limit=1&cursor=${first.next_cursor}`);
    expect(ids(second)).toEqual([MARKED]);
    expect(second.next_cursor).not.toBeNull();

    const third = await readPage(`?limit=1&cursor=${second.next_cursor}`);
    expect(ids(third)).toEqual([OTHER_GROUPS]);
    expect(third.next_cursor).toBeNull();
  });

  it("refuses a cursor issued under different filters", async () => {
    const first = await readPage(`?group_id=${GROUP}&limit=1`);
    const response = await GET(request(`?limit=1&cursor=${first.next_cursor}`));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_query");
    expect(body.error.message).toContain("cursor");
  });

  it("refuses another resource's cursor and a malformed one", async () => {
    const foreign = encodeCursor("products", { limit: 1 }, REPORTED);
    for (const cursor of [foreign, "not-a-cursor"]) {
      const response = await GET(request(`?cursor=${cursor}`));
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
