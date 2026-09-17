import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { GET } from "@/app/api/partner/v1/campaigns/route";
import { partnerCampaignsResponse } from "@/services/partner/partner.contracts";
import type { FetchMock } from "../../mocks/postgrest-fetch";
import {
  PARTNER_TEST_KEY,
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

/**
 * Noon UTC on the last day of September. The runtime zone is pinned to UTC+14
 * below, where it is already 1 October: a month or a day read off the runtime's
 * calendar instead of UTC's would move the default range to October and make
 * C2 (born October 2013) possibly 13.
 */
const NOW = new Date("2026-09-30T12:00:00Z");

const PRODUCT = "10000000-0000-4000-8000-000000000001";

const id = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = (n: number) => id("a", n);
const B = (n: number) => id("b", n);
const C = (n: number) => id("c", n);
const D = (n: number) => id("d", n);
const X = (n: number) => id("e", n);

interface Profile {
  id: string;
  role: string;
  utm_campaign: string | null;
  created_at: string;
}

const account = (
  accountId: string,
  utm_campaign: string | null,
  created_at = "2026-09-10T08:00:00+00:00",
  role = "customer",
): Profile => ({ id: accountId, role, utm_campaign, created_at });

const PROFILES: Profile[] = [
  // lynx-autumn-a: six accounts in September.
  ...[1, 2, 3, 4, 5, 6].map((n) => account(A(n), "lynx-autumn-a")),
  // The same campaign in another letter case is another campaign.
  account(B(1), "Lynx-Autumn-A"),
  // lynx-autumn-b: exactly the minimum of accounts, and nothing after that.
  ...[1, 2, 3, 4, 5].map((n) => account(D(n), "lynx-autumn-b")),
  // In August, a second before the default range opens.
  account(A(0), "lynx-autumn-a", "2026-08-31T23:59:59.999+00:00"),
  // Not counted whatever the range: not a parent, not Lynx's, not a prefix.
  account(X(1), "lynx-autumn-a", "2026-09-10T08:00:00+00:00", "gamer"),
  account(X(2), "rblx-launch"),
  account(X(3), "xlynx-autumn-a"),
  account(X(4), null),
];

const LINKS = [
  { parent_id: A(1), gamer_id: C(1) },
  { parent_id: A(1), gamer_id: C(2) },
  // A child linked to two accounts of the campaign is one child added.
  { parent_id: A(2), gamer_id: C(1) },
  { parent_id: A(2), gamer_id: C(3) },
  { parent_id: A(3), gamer_id: C(4) },
  { parent_id: A(4), gamer_id: C(5) },
  { parent_id: A(5), gamer_id: C(6) },
  { parent_id: A(6), gamer_id: C(8) },
  { parent_id: B(1), gamer_id: C(7) },
];

const BIRTHS: Record<string, string> = {
  [C(1)]: "2012-03-01", // 14
  [C(2)]: "2013-10-01", // 12 on 30 September, possibly 13 from 1 October
  [C(3)]: "2010-05-01", // 16
  [C(4)]: "2008-10-01", // 17, and possibly still 17 through October
  [C(5)]: "2011-01-01", // 15
  [C(6)]: "2013-09-01", // 13 on the last day of their birth month
  [C(7)]: "2012-01-01",
  [C(8)]: "2008-08-01", // 18 whatever day of August they were born
};

/** Live Programme seats, by participant. */
const SEATS = [
  { participant_id: C(2), customer_id: A(1), status: "active" },
  { participant_id: A(2), customer_id: A(2), status: "active" },
  { participant_id: C(4), customer_id: A(3), status: "completed" },
  { participant_id: C(5), customer_id: A(4), status: "waitlisted" },
  { participant_id: C(6), customer_id: A(5), status: "active" },
  { participant_id: C(7), customer_id: B(1), status: "active" },
];

/**
 * `profiles` applies the filters the account read sends — role, the prefix
 * pattern, and the half-open creation window — so the range is exercised
 * rather than assumed. Every other table answers its `in` list.
 */
function tables(
  profiles: Profile[] = PROFILES,
  links: typeof LINKS = LINKS,
  births: Record<string, string> = BIRTHS,
) {
  return postgrestTables({
    profiles: (url) => {
      const role = url.searchParams.get("role")?.replace(/^eq\./, "");
      const pattern = url.searchParams.get("utm_campaign")?.replace(/^ilike\./, "") ?? "";
      const prefix = pattern.endsWith("%") ? pattern.slice(0, -1).toLowerCase() : null;
      const bounds = url.searchParams.getAll("created_at");
      const gte = bounds.find((bound) => bound.startsWith("gte."))?.slice(4);
      const lt = bounds.find((bound) => bound.startsWith("lt."))?.slice(3);
      if (role === undefined || prefix === null || gte === undefined || lt === undefined) {
        throw new Error(`unexpected profiles read: ${url.search}`);
      }
      return profiles
        .filter(
          (row) =>
            row.role === role &&
            row.utm_campaign !== null &&
            row.utm_campaign.toLowerCase().startsWith(prefix) &&
            Date.parse(row.created_at) >= Date.parse(gte) &&
            Date.parse(row.created_at) < Date.parse(lt),
        )
        .map((row) => ({ id: row.id, utm_campaign: row.utm_campaign }));
    },
    parent_gamer: (url) => {
      const parents = inList(url, "parent_id");
      return links.filter((link) => parents.includes(link.parent_id));
    },
    gamer_profiles: (url) =>
      inList(url, "user_id").map((user_id) => ({ user_id, date_of_birth: births[user_id] })),
    participations: (url) => {
      const participants = inList(url, "participant_id");
      return SEATS.filter((row) => participants.includes(row.participant_id)).map(
        (row, i) => ({
          ...row,
          id: id("4", i + 1),
          product_id: PRODUCT,
          group_id: null,
          signed_up_at: "2026-09-01T10:00:00+00:00",
          programme: { programme_terms: [{ document_slug: "roblox-programme-terms" }] },
        }),
      );
    },
  });
}

function request(query = ""): Request {
  return partnerRequest("v1/campaigns", { query });
}

async function readAnswer(query = "") {
  const response = await GET(request(query));
  expect(response.status).toBe(200);
  return partnerCampaignsResponse.parse(await response.json());
}

function accountReads(): URL[] {
  return readsOf(db.fetch, "profiles");
}

// --- Tests ---

describe("GET /api/partner/v1/campaigns", () => {
  let originalTZ: string | undefined;

  beforeEach(() => {
    originalTZ = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati";
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    vi.stubEnv("LYNX_PARTNER_API_KEY", PARTNER_TEST_KEY);
    db.fetch = tables();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    process.env.TZ = originalTZ;
    db.fetch = undefined;
  });

  it("counts the funnel per exactly stored campaign over the current UTC month", async () => {
    expect(await readAnswer()).toEqual({
      range: { from: "2026-09", to: "2026-09" },
      minimum_count: 5,
      campaigns: [
        {
          utm_campaign: "Lynx-Autumn-A",
          accounts_created: null,
          children_added: null,
          children_eligible: null,
          enrolled: null,
        },
        {
          // Six accounts; C1..C6 and C8 added, C1 once; C2 not yet 13 on the
          // UTC day and C8 already 18; A6 alone has no seat in its family.
          utm_campaign: "lynx-autumn-a",
          accounts_created: 6,
          children_added: 7,
          children_eligible: 5,
          enrolled: 5,
        },
        {
          // At the minimum, then zero: a zero is withheld like any small count.
          utm_campaign: "lynx-autumn-b",
          accounts_created: 5,
          children_added: null,
          children_eligible: null,
          enrolled: null,
        },
      ],
    });
  });

  it("reads a child's possible age from the birth month alone, whatever day the row stores", async () => {
    // 10 September, inside every September birth month below. Each account
    // brings one child and holds no seat.
    vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
    const midMonth: Record<string, string> = {
      // Born 20 September 2013: read as a date, only ever 12 today. Born any
      // day of that September, possibly 13 — so eligible.
      [C(11)]: "2013-09-20",
      [C(12)]: "2013-09-05", // possibly 13
      [C(13)]: "2008-09-20", // possibly still 17
      [C(14)]: "2008-09-05", // possibly still 17
      [C(15)]: "2010-05-15", // 16
      [C(16)]: "2014-09-20", // 12 whatever day of September
      [C(17)]: "2007-09-05", // 18 whatever day of September
    };
    const children = Object.keys(midMonth);
    db.fetch = tables(
      children.map((_, i) => account(A(11 + i), "lynx-midmonth")),
      children.map((gamer_id, i) => ({ parent_id: A(11 + i), gamer_id })),
      midMonth,
    );

    expect((await readAnswer()).campaigns).toEqual([
      {
        utm_campaign: "lynx-midmonth",
        accounts_created: 7,
        children_added: 7,
        // Five exactly: C11 read by its stored day would withhold the count.
        children_eligible: 5,
        enrolled: null,
      },
    ]);
  });

  it("reads parent accounts by a literal, case-insensitive prefix over whole UTC months", async () => {
    await readAnswer();

    const [url] = accountReads();
    expect(url.searchParams.get("role")).toBe("eq.customer");
    expect(url.searchParams.get("utm_campaign")).toBe("ilike.lynx-%");
    expect(url.searchParams.getAll("created_at")).toEqual([
      "gte.2026-09-01T00:00:00.000Z",
      "lt.2026-10-01T00:00:00.000Z",
    ]);
  });

  it("covers every month from from to to, inclusive", async () => {
    const answer = await readAnswer("?from=2026-08&to=2026-09");
    expect(answer.range).toEqual({ from: "2026-08", to: "2026-09" });
    expect(answer.campaigns.find((c) => c.utm_campaign === "lynx-autumn-a")?.accounts_created).toBe(7);

    const august = await readAnswer("?to=2026-08");
    expect(august.range).toEqual({ from: "2026-08", to: "2026-08" });
    expect(august.campaigns).toEqual([
      {
        utm_campaign: "lynx-autumn-a",
        accounts_created: null,
        children_added: null,
        children_eligible: null,
        enrolled: null,
      },
    ]);
  });

  it("closes a December range at the start of the next year", async () => {
    await readAnswer("?from=2026-11&to=2026-12");
    const [url] = accountReads();
    expect(url.searchParams.getAll("created_at")).toEqual([
      "gte.2026-11-01T00:00:00.000Z",
      "lt.2027-01-01T00:00:00.000Z",
    ]);
  });

  it("answers the range with no campaigns when no account came through one", async () => {
    db.fetch = postgrestTables(emptyTables);
    expect(await readAnswer("?from=2026-01&to=2026-03")).toEqual({
      range: { from: "2026-01", to: "2026-03" },
      minimum_count: 5,
      campaigns: [],
    });
  });

  it("refuses a from after the current month when to is left to default", async () => {
    const response = await GET(request("?from=2026-10"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_query");
    expect(body.error.message).toContain("from");
    expect(db.fetch).not.toHaveBeenCalled();
  });

  it("forbids caching the answer", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
