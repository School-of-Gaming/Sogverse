import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { GET } from "@/app/api/partner/v1/enrolments/route";
import { encodeCursor } from "@/lib/api/partner-cursor.server";
import type { FetchMock } from "../../mocks/postgrest-fetch";
import {
  PARTNER_TEST_KEY,
  emptyTables,
  filteringTable,
  partnerRequest,
  postgrestTables,
  readsOf,
  type TableHandler,
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
//
// "Now" is pinned to 17 September 2026, midday UTC: the running product is
// under way, the finished one ended in August. Every derivation the route makes
// from the clock — a product's effective status, the consents on file "at or
// before now" — reads that instant, and none reads the runtime's zone.

const NOW = new Date("2026-09-17T12:00:00Z");

const P_RUNNING = "10000000-0000-4000-8000-000000000001";
const P_DONE = "10000000-0000-4000-8000-000000000002";
const P_OTHER = "10000000-0000-4000-8000-000000000003";
const GAMER_A = "20000000-0000-4000-8000-000000000001";
const GAMER_B = "20000000-0000-4000-8000-000000000002";
const PARENT_A = "30000000-0000-4000-8000-000000000001";
const PARENT_B = "30000000-0000-4000-8000-000000000002";
const E1 = "40000000-0000-4000-8000-000000000001";
const E2 = "40000000-0000-4000-8000-000000000002";
const E3 = "40000000-0000-4000-8000-000000000003";
const E4 = "40000000-0000-4000-8000-000000000004";
const E5 = "40000000-0000-4000-8000-000000000005";
const E6 = "40000000-0000-4000-8000-000000000006";
const GROUP_1 = "50000000-0000-4000-8000-000000000001";
const GROUP_2 = "50000000-0000-4000-8000-000000000002";
const S1 = "60000000-0000-4000-8000-000000000001";
const S2 = "60000000-0000-4000-8000-000000000002";
const S3 = "60000000-0000-4000-8000-000000000003";
const S4 = "60000000-0000-4000-8000-000000000004";

const PROGRAMME = { programme_terms: [{ document_slug: "roblox-programme-terms" }] };

function seat(
  id: string,
  fields: {
    product_id: string;
    participant_id: string;
    customer_id: string;
    group_id: string | null;
    status: string;
  },
) {
  return {
    id,
    ...fields,
    signed_up_at: "2026-09-02T18:47:15+00:00",
    programme: PROGRAMME,
  };
}

/** In seat id order, as the database would page them. */
const SEATS = [
  seat(E1, {
    product_id: P_RUNNING,
    participant_id: GAMER_A,
    customer_id: PARENT_A,
    group_id: GROUP_1,
    status: "active",
  }),
  // Held on a product that has finished: reports completed.
  seat(E2, {
    product_id: P_DONE,
    participant_id: GAMER_A,
    customer_id: PARENT_A,
    group_id: GROUP_2,
    status: "active",
  }),
  seat(E3, {
    product_id: P_RUNNING,
    participant_id: GAMER_B,
    customer_id: PARENT_B,
    group_id: null,
    status: "waitlisted",
  }),
  // A parent's own seat: participant and parent are the same person.
  seat(E4, {
    product_id: P_DONE,
    participant_id: PARENT_B,
    customer_id: PARENT_B,
    group_id: null,
    status: "completed",
  }),
  // Not a Programme product: the inner embed finds no requirement.
  {
    ...seat(E5, {
      product_id: P_OTHER,
      participant_id: GAMER_B,
      customer_id: PARENT_B,
      group_id: null,
      status: "active",
    }),
    programme: { programme_terms: [] },
  },
  // Mid-checkout: never a seat anyone holds.
  seat(E6, {
    product_id: P_RUNNING,
    participant_id: GAMER_B,
    customer_id: PARENT_B,
    group_id: null,
    status: "reserving",
  }),
];

function product(id: string, start_date: string, end_date: string) {
  return { id, start_date, end_date, timezone: "Europe/Paris" };
}

function session(id: string, group_id: string, report: string | null) {
  return {
    id,
    group_id,
    session_date: "2026-09-10",
    starts_at: "2026-09-10T15:00:00+00:00",
    ends_at: "2026-09-10T16:30:00+00:00",
    report,
  };
}

const TABLES = {
  participations: filteringTable(SEATS),
  products: filteringTable([
    product(P_RUNNING, "2026-09-01", "2026-12-31"),
    product(P_DONE, "2026-06-01", "2026-08-31"),
  ]),
  consent_document_versions: filteringTable([
    { document_slug: "roblox-privacy-policy", version: "2026-08-01" },
    { document_slug: "roblox-programme-terms", version: "2026-05-01" },
    { document_slug: "roblox-programme-terms", version: "2026-08-01" },
  ]),
  // E1's parent accepted both documents at checkout; every other seat has
  // nothing on file and reports the fallback.
  consent_acceptances: filteringTable([
    {
      id: "70000000-0000-4000-8000-000000000001",
      customer_id: PARENT_A,
      participant_id: GAMER_A,
      product_id: P_RUNNING,
      document_slug: "roblox-programme-terms",
      document_version: "2026-05-01",
      accepted_at: "2026-09-02T18:47:10+00:00",
    },
    {
      id: "70000000-0000-4000-8000-000000000002",
      customer_id: PARENT_A,
      participant_id: GAMER_A,
      product_id: P_RUNNING,
      document_slug: "roblox-privacy-policy",
      document_version: "2026-08-01",
      accepted_at: "2026-09-02T18:47:11+00:00",
    },
  ]),
  group_sessions: filteringTable([
    session(S1, GROUP_1, "We built an obby"),
    // Recorded by its marks alone.
    session(S2, GROUP_1, null),
    // A row for a staff note or an image: not a session.
    session(S3, GROUP_1, null),
    session(S4, GROUP_2, "Final showcase"),
  ]),
  session_attendance: filteringTable([
    { session_id: S1, participant_id: GAMER_A, status: "present" },
    { session_id: S2, participant_id: GAMER_A, status: "absent" },
    { session_id: S4, participant_id: GAMER_A, status: "present" },
  ]),
  gamer_group_creations: filteringTable([
    {
      group_id: GROUP_1,
      participant_id: GAMER_A,
      creations: [
        { title: "Obby Escape", url: "https://www.roblox.com/games/123456789/Obby-Escape" },
        { title: "Build notes", url: "https://example.com/notes" },
      ],
    },
  ]),
} satisfies Record<string, TableHandler>;

// --- Helpers ---

async function get(query = "") {
  const response = await GET(partnerRequest("v1/enrolments", { query }));
  return { response, body: await response.json() };
}

function participationsUrls(): URL[] {
  return readsOf(db.fetch, "participations");
}

// --- Tests ---

describe("GET /api/partner/v1/enrolments", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.stubEnv("LYNX_PARTNER_API_KEY", PARTNER_TEST_KEY);
    db.fetch = postgrestTables(TABLES);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    db.fetch = undefined;
  });

  it("answers every in-scope seat, mapped, in seat id order", async () => {
    const { response, body } = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.next_cursor).toBeNull();
    expect(body.data.map((record: { id: string }) => record.id)).toEqual([E1, E2, E3, E4]);

    expect(body.data[0]).toEqual({
      id: E1,
      product_id: P_RUNNING,
      group_id: GROUP_1,
      participant_id: GAMER_A,
      parent_id: PARENT_A,
      status: "active",
      signed_up_at: "2026-09-02T18:47:15.000Z",
      consents: {
        terms: { version: "2026-05-01", accepted_at: "2026-09-02T18:47:10.000Z" },
        privacy_policy: { version: "2026-08-01", accepted_at: "2026-09-02T18:47:11.000Z" },
      },
      // S1 by its report and S2 by its mark; S3 has neither.
      attendance: { sessions_recorded: 2, sessions_present: 1 },
      creations: [
        {
          title: "Obby Escape",
          url: "https://www.roblox.com/games/123456789/Obby-Escape",
          is_roblox_url: true,
        },
        { title: "Build notes", url: "https://example.com/notes", is_roblox_url: false },
      ],
    });

    expect(body.data[1]).toMatchObject({
      id: E2,
      status: "completed",
      attendance: { sessions_recorded: 1, sessions_present: 1 },
      creations: [],
    });

    // No group: no sessions to count and nothing published. Nothing on file:
    // consented at sign-up on the version then current.
    expect(body.data[2]).toEqual({
      id: E3,
      product_id: P_RUNNING,
      group_id: null,
      participant_id: GAMER_B,
      parent_id: PARENT_B,
      status: "waitlisted",
      signed_up_at: "2026-09-02T18:47:15.000Z",
      consents: {
        terms: { version: "2026-08-01", accepted_at: "2026-09-02T18:47:15.000Z" },
        privacy_policy: { version: "2026-08-01", accepted_at: "2026-09-02T18:47:15.000Z" },
      },
      attendance: { sessions_recorded: 0, sessions_present: 0 },
      creations: [],
    });

    expect(body.data[3]).toMatchObject({
      id: E4,
      participant_id: PARENT_B,
      parent_id: PARENT_B,
      status: "completed",
    });

    const [url] = participationsUrls();
    expect(url.searchParams.get("select")).toContain(
      "programme:products!inner(programme_terms:product_required_consents!inner(document_slug))",
    );
    expect(url.searchParams.get("programme.programme_terms.document_slug")).toBe(
      "eq.roblox-programme-terms",
    );
    expect(url.searchParams.get("status")).toBe("in.(active,waitlisted,completed)");
    expect(url.searchParams.get("order")).toBe("id.asc");
  });

  it("answers an empty page when nothing is in scope", async () => {
    db.fetch = postgrestTables(emptyTables);
    const { response, body } = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body).toEqual({ data: [], next_cursor: null });
  });

  describe("filters", () => {
    it("narrows by product in the database", async () => {
      const { body } = await get(`?product_id=${P_DONE}`);
      expect(body.data.map((record: { id: string }) => record.id)).toEqual([E2, E4]);
      expect(participationsUrls()[0].searchParams.get("product_id")).toBe(`eq.${P_DONE}`);
    });

    it("narrows by participant in the database", async () => {
      const { body } = await get(`?participant_id=${PARENT_B}`);
      expect(body.data.map((record: { id: string }) => record.id)).toEqual([E4]);
      expect(participationsUrls()[0].searchParams.get("participant_id")).toBe(
        `eq.${PARENT_B}`,
      );
    });

    it("narrows by the parent holding the seat, the parent's own seats included", async () => {
      const { body } = await get(`?parent_id=${PARENT_B}`);
      expect(body.data.map((record: { id: string }) => record.id)).toEqual([E3, E4]);
      expect(participationsUrls()[0].searchParams.get("customer_id")).toBe(`eq.${PARENT_B}`);
    });

    it("matches an unknown product as nothing, not as an error", async () => {
      const { response, body } = await get(`?product_id=${P_OTHER}`);
      expect(response.status).toBe(200);
      expect(body).toEqual({ data: [], next_cursor: null });
    });

    it("status=active drops a held seat on a completed product", async () => {
      const { body } = await get("?status=active");
      expect(body.data.map((record: { id: string }) => record.id)).toEqual([E1]);
      expect(participationsUrls()[0].searchParams.get("status")).toBe("in.(active)");
    });

    it("status=completed includes a held seat on a completed product", async () => {
      const { body } = await get("?status=completed");
      expect(body.data.map((record: { id: string }) => record.id)).toEqual([E2, E4]);
      expect(participationsUrls()[0].searchParams.get("status")).toBe(
        "in.(active,completed)",
      );
    });

    it("status=waitlisted reads only waitlisted seats", async () => {
      const { body } = await get("?status=waitlisted");
      expect(body.data.map((record: { id: string }) => record.id)).toEqual([E3]);
      expect(participationsUrls()[0].searchParams.get("status")).toBe("in.(waitlisted)");
    });
  });

  describe("paging", () => {
    it("walks the seats across pages with next_cursor", async () => {
      const first = await get("?limit=2");
      expect(first.body.data.map((record: { id: string }) => record.id)).toEqual([E1, E2]);
      expect(first.body.next_cursor).toEqual(expect.any(String));

      const second = await get(`?limit=2&cursor=${first.body.next_cursor}`);
      expect(second.body.data.map((record: { id: string }) => record.id)).toEqual([E3, E4]);
      expect(second.body.next_cursor).toBeNull();
      expect(participationsUrls().at(-1)?.searchParams.get("id")).toBe(`gt.${E2}`);
    });

    it("keeps walking past seats the status filter drops", async () => {
      // E1 (running) is fetched and dropped; E3 is never a candidate.
      const first = await get("?status=completed&limit=1");
      expect(first.body.data.map((record: { id: string }) => record.id)).toEqual([E2]);
      expect(first.body.next_cursor).toEqual(expect.any(String));

      const second = await get(`?status=completed&limit=1&cursor=${first.body.next_cursor}`);
      expect(second.body.data.map((record: { id: string }) => record.id)).toEqual([E4]);
      expect(second.body.next_cursor).toBeNull();
    });

    it("refuses a cursor another resource issued", async () => {
      const cursor = encodeCursor("products", { limit: 2 }, E1);
      const { response, body } = await get(`?limit=2&cursor=${cursor}`);
      expect(response.status).toBe(400);
      expect(body.error.code).toBe("invalid_query");
      expect(body.error.message).toMatch(/^cursor:/);
    });

    it("refuses a malformed cursor", async () => {
      const { response, body } = await get("?cursor=not-a-cursor");
      expect(response.status).toBe(400);
      expect(body.error.code).toBe("invalid_query");
    });

    it("refuses a cursor issued under different filters", async () => {
      const first = await get("?limit=1");
      const { response, body } = await get(
        `?limit=1&status=active&cursor=${first.body.next_cursor}`,
      );
      expect(response.status).toBe(400);
      expect(body.error.code).toBe("invalid_query");
      expect(body.error.message).toMatch(/different filters/);
    });
  });

  it("answers internal_error, in the envelope, when a document version is not a date", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    db.fetch = postgrestTables({
      ...TABLES,
      consent_document_versions: filteringTable([
        { document_slug: "roblox-privacy-policy", version: "v2" },
        { document_slug: "roblox-programme-terms", version: "2026-08-01" },
      ]),
    });
    const { response, body } = await get();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("internal_error");
    expect(consoleError).toHaveBeenCalled();
  });
});
