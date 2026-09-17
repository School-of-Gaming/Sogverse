import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { GET } from "@/app/api/partner/v1/roblox-research/route";
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
// Nothing this resource derives reads the clock — ages are measured on each
// product's start date, as calendar digits — but "now" is pinned all the same,
// so a derivation that starts reading it cannot pass by the day it runs on.

const NOW = new Date("2026-09-17T12:00:00Z");

const P_CAMP = "10000000-0000-4000-8000-000000000001";
const P_CLUB = "10000000-0000-4000-8000-000000000002";
const P_EVENT = "10000000-0000-4000-8000-000000000003";
const GAMER_A = "20000000-0000-4000-8000-000000000001";
const GAMER_B = "20000000-0000-4000-8000-000000000002";
const GAMER_C = "20000000-0000-4000-8000-000000000003";
const GAMER_D = "20000000-0000-4000-8000-000000000004";
const PARENT_A = "30000000-0000-4000-8000-000000000001";
const R1 = "40000000-0000-4000-8000-000000000001";
const R2 = "40000000-0000-4000-8000-000000000002";
const R3 = "40000000-0000-4000-8000-000000000003";
const R4 = "40000000-0000-4000-8000-000000000004";
const R5 = "40000000-0000-4000-8000-000000000005";
const R6 = "40000000-0000-4000-8000-000000000006";
const GROUP_1 = "50000000-0000-4000-8000-000000000001";
const L_SITE = "80000000-0000-4000-8000-000000000001";
const L_REGION = "80000000-0000-4000-8000-000000000002";

const ACTIVITIES = {
  [P_CAMP]: {
    product_type: "camp",
    is_remote: false,
    start_date: "2026-10-19",
    spoken_language_code: "fr",
  },
  [P_CLUB]: {
    product_type: "consumer_club",
    is_remote: true,
    start_date: null,
    spoken_language_code: "fi",
  },
  [P_EVENT]: {
    product_type: "event",
    is_remote: true,
    start_date: "2026-11-02",
    spoken_language_code: "fi",
  },
};

function seat(
  id: string,
  fields: {
    product_id: keyof typeof ACTIVITIES;
    participant_id: string;
    group_id?: string | null;
    status?: string;
    role?: string;
    date_of_birth?: string;
    home_location_id?: string | null;
  },
) {
  return {
    id,
    product_id: fields.product_id,
    group_id: fields.group_id ?? null,
    participant_id: fields.participant_id,
    status: fields.status ?? "active",
    programme: { programme_terms: [{ document_slug: "roblox-programme-terms" }] },
    child: {
      role: fields.role ?? "gamer",
      gamer_profiles:
        fields.role === undefined || fields.role === "gamer"
          ? { date_of_birth: fields.date_of_birth ?? "2012-03-01" }
          : null,
    },
    holder: { home_location_id: fields.home_location_id ?? null },
    activity: ACTIVITIES[fields.product_id],
  };
}

/** In seat id order, as the database would page them. */
const SEATS = [
  // Born in October: on the camp's 19 October start the child may or may not
  // have had their birthday yet.
  seat(R1, {
    product_id: P_CAMP,
    participant_id: GAMER_A,
    group_id: GROUP_1,
    date_of_birth: "2012-10-01",
    home_location_id: L_SITE,
  }),
  // No start date, no group, no home location, an unverified username.
  seat(R2, { product_id: P_CLUB, participant_id: GAMER_B, status: "waitlisted" }),
  // A cleared username: no account, so no row (D10).
  seat(R3, { product_id: P_CAMP, participant_id: GAMER_C, status: "completed" }),
  // A parent's own seat: never a research row.
  seat(R4, { product_id: P_CAMP, participant_id: PARENT_A, role: "customer" }),
  seat(R5, {
    product_id: P_EVENT,
    participant_id: GAMER_D,
    home_location_id: L_REGION,
  }),
  // Mid-checkout: never a seat anyone holds.
  seat(R6, { product_id: P_EVENT, participant_id: GAMER_D, status: "reserving" }),
];

function chainNode(
  id: string,
  type: string,
  name: string,
  country_code: string,
  parent: unknown = null,
) {
  return { id, name, name_i18n: null, type, parent_id: null, country_code, external_code: null, parent };
}

const TABLES = {
  participations: filteringTable(SEATS),
  roblox_accounts: filteringTable([
    { user_id: GAMER_A, roblox_username: "builder_leo", roblox_user_id: 1234567890 },
    { user_id: GAMER_B, roblox_username: "obby_ana", roblox_user_id: null },
    { user_id: GAMER_C, roblox_username: null, roblox_user_id: null },
    { user_id: GAMER_D, roblox_username: "mika_builds", roblox_user_id: 42 },
    // A parent with a Roblox account of their own is still not a child.
    { user_id: PARENT_A, roblox_username: "dad_builds", roblox_user_id: 7 },
  ]),
  locations: filteringTable([
    {
      ...chainNode(
        L_SITE,
        "site",
        "Lycée du Parc",
        "FR",
        chainNode("l-lyon", "municipality", "Lyon", "FR", chainNode("l-fr", "country", "France", "FR")),
      ),
      created_at: "2026-01-01T00:00:00+00:00",
      updated_at: "2026-01-01T00:00:00+00:00",
    },
    {
      ...chainNode(L_REGION, "region", "Uusimaa", "FI", chainNode("l-fi", "country", "Finland", "FI")),
      created_at: "2026-01-01T00:00:00+00:00",
      updated_at: "2026-01-01T00:00:00+00:00",
    },
  ]),
  product_translations: filteringTable([
    { product_id: P_CAMP, locale: "en", name: "Roblox Creator Camp — Lyon" },
    { product_id: P_CAMP, locale: "fr", name: "Camp Créateur Roblox — Lyon" },
    { product_id: P_CLUB, locale: "fi", name: "Roblox-kerho" },
    { product_id: P_CLUB, locale: "sv", name: "Roblox-klubb" },
    // Neither English nor the spoken Finnish: the first locale by code.
    { product_id: P_EVENT, locale: "fr", name: "Journée Roblox" },
    { product_id: P_EVENT, locale: "sv", name: "Roblox-dag" },
  ]),
  gamer_group_creations: filteringTable([
    {
      group_id: GROUP_1,
      participant_id: GAMER_A,
      creations: [
        { title: "Build notes", url: "https://example.com/notes" },
        // A roblox.com lookalike is not a Roblox link.
        { title: "Mirror", url: "https://roblox.com.example.org/games/1" },
        { title: "Obby Escape", url: "https://www.roblox.com/games/123456789/Obby-Escape" },
        { title: "Sequel", url: "https://www.roblox.com/games/987654321/Obby-Escape-2" },
      ],
    },
  ]),
} satisfies Record<string, TableHandler>;

// --- Helpers ---

async function get(query = "") {
  const response = await GET(partnerRequest("v1/roblox-research", { query }));
  return { response, body: await response.json() };
}

function usernames(body: { data: { roblox_username: string }[] }): string[] {
  return body.data.map((row) => row.roblox_username);
}

function participationsUrls(): URL[] {
  return readsOf(db.fetch, "participations");
}

// --- Tests ---

describe("GET /api/partner/v1/roblox-research", () => {
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

  it("answers one row per child seat with a Roblox account, mapped, in seat order", async () => {
    const { response, body } = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.next_cursor).toBeNull();

    expect(body.data).toEqual([
      {
        roblox_username: "builder_leo",
        roblox_user_id: 1234567890,
        country_code: "FR",
        city: "Lyon",
        age: { min: 13, max: 14 },
        activity: {
          product_id: P_CAMP,
          name: "Roblox Creator Camp — Lyon",
          type: "camp",
          delivery: "in_person",
          start_date: "2026-10-19",
        },
        published_game_url: "https://www.roblox.com/games/123456789/Obby-Escape",
      },
      {
        roblox_username: "obby_ana",
        roblox_user_id: null,
        country_code: null,
        city: null,
        age: null,
        activity: {
          product_id: P_CLUB,
          // No English: the language the product is delivered in.
          name: "Roblox-kerho",
          type: "consumer_club",
          delivery: "online",
          start_date: null,
        },
        published_game_url: null,
      },
      {
        roblox_username: "mika_builds",
        roblox_user_id: 42,
        // A home location inside no municipality: the country alone.
        country_code: "FI",
        city: null,
        age: { min: 14, max: 14 },
        activity: {
          product_id: P_EVENT,
          name: "Journée Roblox",
          type: "event",
          delivery: "online",
          start_date: "2026-11-02",
        },
        published_game_url: null,
      },
    ]);

    const [url] = participationsUrls();
    expect(url.searchParams.get("select")).toContain(
      "programme:products!inner(programme_terms:product_required_consents!inner(document_slug))",
    );
    expect(url.searchParams.get("select")).toContain(
      "child:profiles!participations_participant_id_fkey!inner(",
    );
    expect(url.searchParams.get("programme.programme_terms.document_slug")).toBe(
      "eq.roblox-programme-terms",
    );
    expect(url.searchParams.get("child.role")).toBe("eq.gamer");
    expect(url.searchParams.get("status")).toBe("in.(active,waitlisted,completed)");
    expect(url.searchParams.get("order")).toBe("id.asc");
  });

  it("carries no identifier of the child, the family or the seat", async () => {
    const { body } = await get();
    const serialized = JSON.stringify(body.data);

    for (const id of [GAMER_A, GAMER_B, GAMER_D, PARENT_A, R1, R2, R5, GROUP_1, L_SITE]) {
      expect(serialized).not.toContain(id);
    }
    for (const row of body.data) {
      expect(Object.keys(row).sort()).toEqual([
        "activity",
        "age",
        "city",
        "country_code",
        "published_game_url",
        "roblox_user_id",
        "roblox_username",
      ]);
    }
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
      const { body } = await get(`?product_id=${P_EVENT}`);
      expect(usernames(body)).toEqual(["mika_builds"]);
      expect(participationsUrls()[0].searchParams.get("product_id")).toBe(`eq.${P_EVENT}`);
    });

    it("narrows on the product's start date, inclusive, leaving out undated products", async () => {
      const { body } = await get("?from=2026-10-19&to=2026-10-31");
      expect(usernames(body)).toEqual(["builder_leo"]);
      const url = participationsUrls()[0];
      expect(url.searchParams.getAll("activity.start_date")).toEqual([
        "gte.2026-10-19",
        "lte.2026-10-31",
      ]);
      expect(url.searchParams.get("select")).toContain("activity:products!inner(");
    });

    it("takes from and to on their own", async () => {
      expect(usernames((await get("?from=2026-11-02")).body)).toEqual(["mika_builds"]);
      expect(usernames((await get("?to=2026-11-01")).body)).toEqual(["builder_leo"]);
    });
  });

  describe("paging", () => {
    it("walks the rows across pages, past seats that yield no row", async () => {
      const first = await get("?limit=2");
      expect(usernames(first.body)).toEqual(["builder_leo", "obby_ana"]);
      expect(first.body.next_cursor).toEqual(expect.any(String));

      const second = await get(`?limit=2&cursor=${first.body.next_cursor}`);
      expect(usernames(second.body)).toEqual(["mika_builds"]);
      expect(second.body.next_cursor).toBeNull();
      expect(participationsUrls().at(-1)?.searchParams.get("id")).toBe(`gt.${R2}`);
    });

    it("refuses a cursor another resource issued", async () => {
      const cursor = encodeCursor("enrolments", { limit: 2 }, R1);
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
        `?limit=1&product_id=${P_CAMP}&cursor=${first.body.next_cursor}`,
      );
      expect(response.status).toBe(400);
      expect(body.error.code).toBe("invalid_query");
      expect(body.error.message).toMatch(/different filters/);
    });
  });

  it("answers internal_error, in the envelope, for a gamer with no gamer profile", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = seat(R1, { product_id: P_CAMP, participant_id: GAMER_A });
    db.fetch = postgrestTables({
      ...TABLES,
      participations: filteringTable([{ ...broken, child: { role: "gamer", gamer_profiles: null } }]),
    });
    const { response, body } = await get();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("internal_error");
    expect(consoleError).toHaveBeenCalled();
  });
});
