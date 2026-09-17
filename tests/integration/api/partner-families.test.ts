import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { GET } from "@/app/api/partner/v1/families/route";
import { encodeCursor } from "@/lib/api/partner-cursor.server";
import { partnerFamiliesResponse } from "@/services/partner/partner.contracts";
import { requestedUrl, type FetchMock } from "../../mocks/postgrest-fetch";
import {
  PARTNER_TEST_KEY,
  emptyTables,
  partnerRequest,
  postgrestTables,
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
const PRODUCT_2 = "10000000-0000-4000-8000-000000000002";

const P0 = "30000000-0000-4000-8000-000000000000";
const P1 = "30000000-0000-4000-8000-000000000001";
const P2 = "30000000-0000-4000-8000-000000000002";
const P3 = "30000000-0000-4000-8000-000000000003";
const P4 = "30000000-0000-4000-8000-000000000004";

const G1 = "20000000-0000-4000-8000-000000000001";
const G2 = "20000000-0000-4000-8000-000000000002";
const G3 = "20000000-0000-4000-8000-000000000003";
const G5 = "20000000-0000-4000-8000-000000000005";

interface Seat {
  id: string;
  product_id: string;
  participant_id: string;
  customer_id: string;
  status: string;
}

interface Link {
  parent_id: string;
  gamer_id: string;
}

interface Consent {
  id: string;
  granted: boolean;
  updated_at: string;
}

interface World {
  seats: Seat[];
  links: Link[];
  profiles: Record<string, unknown>[];
  gamerProfiles: { user_id: string; date_of_birth: string }[];
  marketing: Consent[];
  photo: Consent[];
  roblox: { user_id: string; roblox_username: string | null; roblox_user_id: number | null }[];
}

function seat(n: number, participant_id: string, customer_id: string, status = "active"): Seat {
  return {
    id: `40000000-0000-4000-8000-00000000000${n}`,
    product_id: n % 2 === 0 ? PRODUCT_2 : PRODUCT,
    participant_id,
    customer_id,
    status,
  };
}

function parentProfile(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    first_name: `Parent${id.slice(-1)}`,
    last_name: "Martin",
    email: `parent${id.slice(-1)}@example.com`,
    created_at: "2026-09-02T18:41:07.25+00:00",
    home_location_id: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    ...overrides,
  };
}

function gamerProfile(id: string) {
  return {
    ...parentProfile(id),
    first_name: `Gamer${id.slice(-1)}`,
    last_name: "",
    email: `${id}@gamer.sogverse.internal`,
    created_at: "2026-09-02T18:45:30+00:00",
  };
}

/**
 * Three families:
 *
 * - P1 on a seat of their own, with a home location, a Lynx campaign and the
 *   marketing consent granted.
 * - P2 with two seated gamers (G1 on two products, G2 waitlisted); consent
 *   refused.
 * - G3's two parents, P3 and P4, one family keyed on P3; P4 also holds a seat of
 *   their own. P3 was never asked for consent; P4 granted it.
 */
function world(): World {
  return {
    seats: [
      seat(1, G1, P2),
      seat(2, G1, P2),
      seat(3, G2, P2, "waitlisted"),
      seat(4, P1, P1, "completed"),
      seat(5, G3, P3),
      seat(6, P4, P4),
    ],
    links: [
      { parent_id: P2, gamer_id: G1 },
      { parent_id: P2, gamer_id: G2 },
      { parent_id: P3, gamer_id: G3 },
      { parent_id: P4, gamer_id: G3 },
    ],
    profiles: [
      parentProfile(P1, {
        home_location_id: "l-site",
        utm_source: "lynx",
        utm_medium: "email",
        utm_campaign: "lynx-autumn-a",
      }),
      parentProfile(P2),
      parentProfile(P3, { utm_campaign: "Lynx-Autumn-A" }),
      parentProfile(P4, { utm_campaign: "lynx-autumn-a" }),
      gamerProfile(G1),
      gamerProfile(G2),
      gamerProfile(G3),
    ],
    gamerProfiles: [
      { user_id: G1, date_of_birth: "2012-03-01" },
      { user_id: G2, date_of_birth: "2013-11-01" },
      { user_id: G3, date_of_birth: "2011-01-01" },
    ],
    marketing: [
      { id: P1, granted: true, updated_at: "2026-09-02T18:43:12+00:00" },
      { id: P2, granted: false, updated_at: "2026-09-03T08:00:00+00:00" },
      { id: P4, granted: true, updated_at: "2026-09-04T08:00:00+00:00" },
    ],
    photo: [{ id: G2, granted: true, updated_at: "2026-09-02T18:46:01+00:00" }],
    roblox: [
      { user_id: G1, roblox_username: "builder_leo", roblox_user_id: 1234567890 },
      { user_id: G3, roblox_username: "typed_by_hand", roblox_user_id: null },
    ],
  };
}

/** The values of an `in.(…)` filter. */
function inList(url: URL, column: string): string[] {
  const value = url.searchParams.get(column) ?? "";
  return /^in\.\((.*)\)$/.exec(value)?.[1].split(",") ?? [];
}

const chainNode = (id: string, type: string, name: string, parent: unknown = null) => ({
  id,
  name,
  name_i18n: null,
  type,
  parent_id: null,
  country_code: "FR",
  external_code: null,
  parent,
});

/**
 * The fixture database, answering each read as PostgREST would for the filters
 * the read sends: scoped seats as they are, keyed reads by their `in` list, and
 * the two filter reads by their `eq` filters.
 */
function tables(state: World, { locations = true } = {}) {
  return postgrestTables({
    participations: () =>
      state.seats.map((row) => ({
        ...row,
        group_id: null,
        signed_up_at: "2026-09-01T10:00:00+00:00",
        programme: { programme_terms: [{ document_slug: "roblox-programme-terms" }] },
      })),
    parent_gamer: (url) => {
      const gamers = inList(url, "gamer_id");
      return state.links.filter((link) => gamers.includes(link.gamer_id));
    },
    profiles: (url) => {
      const campaign = url.searchParams.get("utm_campaign");
      if (campaign !== null) {
        return state.profiles
          .filter((row) => `eq.${String(row.utm_campaign)}` === campaign)
          .map((row) => ({ id: row.id }));
      }
      const ids = inList(url, "id");
      return state.profiles.filter((row) => ids.includes(String(row.id)));
    },
    marketing_consents: (url) => {
      if (url.searchParams.get("granted") === "eq.true") {
        return state.marketing
          .filter((row) => row.granted)
          .map((row) => ({ customer_id: row.id }));
      }
      const ids = inList(url, "customer_id");
      return state.marketing
        .filter((row) => ids.includes(row.id))
        .map(({ id, ...row }) => ({ customer_id: id, ...row }));
    },
    gamer_profiles: (url) => {
      const ids = inList(url, "user_id");
      return state.gamerProfiles.filter((row) => ids.includes(row.user_id));
    },
    gamer_photo_consents: (url) => {
      const ids = inList(url, "gamer_id");
      return state.photo
        .filter((row) => ids.includes(row.id))
        .map(({ id, ...row }) => ({ gamer_id: id, ...row }));
    },
    roblox_accounts: (url) => {
      const ids = inList(url, "user_id");
      return state.roblox.filter((row) => ids.includes(row.user_id));
    },
    locations: () => (!locations ? [] : [
      {
        ...chainNode(
          "l-site",
          "postal_area",
          "Lyon 3e",
          chainNode("l-lyon", "municipality", "Lyon", chainNode("l-fr", "country", "France")),
        ),
        created_at: "2026-01-01T00:00:00+00:00",
        updated_at: "2026-01-01T00:00:00+00:00",
      },
    ]),
  });
}

function request(query = ""): Request {
  return partnerRequest("v1/families", { query });
}

async function readPage(query = "") {
  const response = await GET(request(query));
  expect(response.status).toBe(200);
  return partnerFamiliesResponse.parse(await response.json());
}

/** Each family as its parent ids and gamer ids. */
function members(body: Awaited<ReturnType<typeof readPage>>) {
  return body.data.map((family) => [
    family.parents.map((parent) => parent.id),
    family.gamers.map((gamer) => gamer.id),
  ]);
}

function readsOf(table: string): URL[] {
  return (db.fetch?.mock.calls ?? [])
    .map(([input]) => requestedUrl(input))
    .filter((url) => url.pathname.endsWith(`/${table}`));
}

// --- Tests ---

describe("GET /api/partner/v1/families", () => {
  let state: World;

  beforeEach(() => {
    vi.stubEnv("LYNX_PARTNER_API_KEY", PARTNER_TEST_KEY);
    state = world();
    db.fetch = tables(state);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    db.fetch = undefined;
  });

  it("assembles each family from its in-scope members, keyed on the smallest parent id", async () => {
    const body = await readPage();

    expect(members(body)).toEqual([
      [[P1], []],
      [[P2], [G1, G2]],
      [[P3, P4], [G3]],
    ]);
    expect(body.next_cursor).toBeNull();
  });

  it("maps parents and gamers to the documented records", async () => {
    const [own, twoGamers, twoParents] = (await readPage()).data;

    expect(own.parents).toEqual([
      {
        id: P1,
        first_name: "Parent1",
        last_name: "Martin",
        email: "parent1@example.com",
        created_at: "2026-09-02T18:41:07.250Z",
        location: { city: "Lyon", country_code: "FR" },
        utm: { source: "lynx", medium: "email", campaign: "lynx-autumn-a" },
        marketing_consent: { granted: true, updated_at: "2026-09-02T18:43:12.000Z" },
      },
    ]);

    // Refused consent: the email is withheld and the refusal reported.
    expect(twoGamers.parents[0]).toMatchObject({
      id: P2,
      email: null,
      location: null,
      utm: { source: null, medium: null, campaign: null },
      marketing_consent: { granted: false, updated_at: "2026-09-03T08:00:00.000Z" },
    });
    expect(twoGamers.gamers).toEqual([
      {
        id: G1,
        first_name: "Gamer1",
        created_at: "2026-09-02T18:45:30.000Z",
        birth_month: "2012-03",
        roblox: { username: "builder_leo", user_id: 1234567890, verified: true },
        photo_consent: null,
      },
      {
        id: G2,
        first_name: "Gamer2",
        created_at: "2026-09-02T18:45:30.000Z",
        birth_month: "2013-11",
        roblox: null,
        photo_consent: { granted: true, updated_at: "2026-09-02T18:46:01.000Z" },
      },
    ]);

    // Never asked: no consent and no email; each parent's consent is their own.
    expect(twoParents.parents.map((parent) => [parent.id, parent.email, parent.marketing_consent])).toEqual([
      [P3, null, null],
      [P4, "parent4@example.com", { granted: true, updated_at: "2026-09-04T08:00:00.000Z" }],
    ]);
    expect(twoParents.gamers[0].roblox).toEqual({
      username: "typed_by_hand",
      user_id: null,
      verified: false,
    });
  });

  it("reads each in-scope gamer's links once, and only theirs", async () => {
    await readPage();

    const [links] = readsOf("parent_gamer");
    expect(readsOf("parent_gamer")).toHaveLength(1);
    expect(inList(links, "gamer_id").sort()).toEqual([G1, G2, G3]);
  });

  it("answers an empty last page when nothing is in scope", async () => {
    db.fetch = postgrestTables(emptyTables);
    expect(await readPage()).toEqual({ data: [], next_cursor: null });
  });

  it("marketing_consent=granted admits a family where any parent granted it", async () => {
    const body = await readPage("?marketing_consent=granted");

    expect(members(body)).toEqual([
      [[P1], []],
      [[P3, P4], [G3]],
    ]);
    const [granted] = readsOf("marketing_consents").filter((url) => url.searchParams.has("granted"));
    expect(granted.searchParams.get("consent_type")).toBe("eq.lynx_educate");
  });

  it("utm_campaign matches any parent's stored campaign exactly and case-sensitively", async () => {
    expect(members(await readPage("?utm_campaign=lynx-autumn-a"))).toEqual([
      [[P1], []],
      [[P3, P4], [G3]],
    ]);
    expect(members(await readPage("?utm_campaign=Lynx-Autumn-A"))).toEqual([[[P3, P4], [G3]]]);
    expect((await readPage("?utm_campaign=lynx-autumn")).data).toEqual([]);
  });

  it("combines both filters", async () => {
    state.marketing = state.marketing.filter((row) => row.id !== P4);
    expect(members(await readPage("?marketing_consent=granted&utm_campaign=Lynx-Autumn-A"))).toEqual([]);
    expect(members(await readPage("?marketing_consent=granted&utm_campaign=lynx-autumn-a"))).toEqual([
      [[P1], []],
    ]);
  });

  it("pages through the families with next_cursor", async () => {
    const seen: string[][] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = `?limit=1${cursor === null ? "" : `&cursor=${cursor}`}`;
      const body = await readPage(query);
      seen.push(...body.data.map((family) => family.parents.map((parent) => parent.id)));
      cursor = body.next_cursor;
      pages += 1;
    } while (cursor !== null);

    expect(seen).toEqual([[P1], [P2], [P3, P4]]);
    expect(pages).toBe(3);
  });

  it("keeps a cursor working when families change between pages", async () => {
    const first = await readPage("?limit=1");
    expect(members(first)).toEqual([[[P1], []]]);

    // Between the pages: a family appears before the cursor, P2's gamers lose
    // their seats, and a new family appears after it.
    state.seats = state.seats.filter((row) => row.customer_id !== P2);
    state.seats.push(seat(7, P0, P0), seat(8, G5, P2));
    state.links.push({ parent_id: P2, gamer_id: G5 });
    state.profiles.push(parentProfile(P0), gamerProfile(G5));
    state.gamerProfiles.push({ user_id: G5, date_of_birth: "2012-06-01" });

    const second = await readPage(`?limit=1&cursor=${first.next_cursor}`);
    expect(members(second)).toEqual([[[P2], [G5]]]);
    const third = await readPage(`?limit=1&cursor=${second.next_cursor}`);
    expect(members(third)).toEqual([[[P3, P4], [G3]]]);
    expect(third.next_cursor).toBeNull();
  });

  it("leaves out a person deleted while the page was read, and a family left without a parent", async () => {
    state.profiles = state.profiles.filter((row) => row.id !== P1 && row.id !== G2);
    state.gamerProfiles = state.gamerProfiles.filter((row) => row.user_id !== G2);

    expect(members(await readPage())).toEqual([
      [[P2], [G1]],
      [[P3, P4], [G3]],
    ]);
  });

  it("refuses a cursor issued under different filters", async () => {
    const first = await readPage("?limit=1");
    const response = await GET(request(`?limit=1&marketing_consent=granted&cursor=${first.next_cursor}`));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_query");
    expect(body.error.message).toContain("cursor");
  });

  it("refuses another resource's cursor and a malformed one", async () => {
    const foreign = encodeCursor("enrolments", { limit: 1 }, P1);
    for (const cursor of [foreign, "not-a-cursor"]) {
      const response = await GET(request(`?cursor=${cursor}`));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("invalid_query");
      expect(body.error.message).toContain("cursor");
    }
  });

  it("answers internal_error when a home location does not exist", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    // The foreign key nulls a deleted location out of the profile, so this is a
    // broken invariant: a loud 500 rather than a parent placed nowhere.
    db.fetch = tables(state, { locations: false });

    const response = await GET(request());
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("internal_error");
    consoleError.mockRestore();
  });

  it("forbids caching the answer", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
