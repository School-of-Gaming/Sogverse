import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// The token helpers read PIN_COOKIE_SECRET lazily; set it before the routes are
// imported. NEXT_PUBLIC_SITE_URL is what getOrigin falls back to when a mock
// request carries no trusted Host, which is the production-representative path.
process.env.PIN_COOKIE_SECRET = "route-test-pin-secret";
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => mockAdminFrom(table),
  })),
}));

import { GET } from "@/app/api/calendar/feed/[token]/route";
import { POST } from "@/app/api/admin/calendar-feed/route";
import { createCalendarFeedToken, verifyCalendarFeedToken } from "@/lib/calendar-feed/token";

// --- Fixtures ---

const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const PARTICIPANT_ID = "22222222-2222-2222-2222-222222222222";
const PARTICIPATION_ID = "33333333-3333-3333-3333-333333333333";

const CUSTOMER_ROW = {
  id: CUSTOMER_ID,
  first_name: "Riikka",
  last_name: "Virtanen",
  email: "riikka@example.test",
  role: "customer",
  locale: "en",
};

const PARTICIPATION_ROW = {
  id: PARTICIPATION_ID,
  participant_id: PARTICIPANT_ID,
  product: {
    id: "44444444-4444-4444-4444-444444444444",
    product_type: "consumer_club",
    timezone: "Europe/Helsinki",
    // Well in the past, so the walk always has occurrences ahead of it.
    start_date: "2020-01-06",
    end_date: null,
    is_remote: true,
    spoken_language_code: "en",
    product_translations: [{ locale: "en", name: "Minecraft Club" }],
    schedule_slots: [
      { weekday: 0, start_time: "16:30:00", duration_minutes: 90 },
    ],
    location: null,
  },
  participant: { first_name: "Aino" },
};

interface ChainResult {
  data: unknown;
  error: unknown;
}

/**
 * A PostgREST-shaped builder: every filter returns the same node, the node is
 * awaitable (a list read), and `maybeSingle` resolves the same fixture.
 * Annotated up front so the self-reference type-checks.
 */
interface Chain {
  select: () => Chain;
  eq: () => Chain;
  ilike: () => Chain;
  in: () => Chain;
  maybeSingle: () => Promise<ChainResult>;
  then: (
    onFulfilled?: (value: ChainResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

function chain(result: ChainResult): Chain {
  const node: Chain = {
    select: () => node,
    eq: () => node,
    ilike: () => node,
    in: () => node,
    maybeSingle: () => Promise.resolve(result),
    then: (onFulfilled, onRejected) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return node;
}

function tables(overrides: Record<string, ChainResult> = {}) {
  const defaults: Record<string, ChainResult> = {
    profiles: { data: CUSTOMER_ROW, error: null },
    participations: { data: [PARTICIPATION_ROW], error: null },
    family_subscriptions: { data: [], error: null },
  };
  const merged = { ...defaults, ...overrides };
  return (table: string) => chain(merged[table] ?? { data: [], error: null });
}

async function feedRequest(token: string, query = ""): Promise<Response> {
  const url = `https://test.sogverse.local/api/calendar/feed/${token}${query}`;
  return GET(new Request(url), { params: Promise.resolve({ token }) });
}

// --- Feed route ---

describe("GET /api/calendar/feed/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminFrom.mockImplementation(tables());
  });

  /**
   * A bad token answers 404, not 401 or 403. Distinguishing "no such customer"
   * from "wrong signature" would leak the fact that a given id is a customer of
   * ours, which is part of what the token protects.
   */
  it("returns 404 for a token that does not verify", async () => {
    const response = await feedRequest("not-a-token");
    expect(response.status).toBe(404);
  });

  it("returns 404 for a valid signature over an unknown customer", async () => {
    mockAdminFrom.mockImplementation(
      tables({ profiles: { data: null, error: null } }),
    );
    const token = await createCalendarFeedToken(CUSTOMER_ID);
    const response = await feedRequest(token);
    expect(response.status).toBe(404);
  });

  it("does not reach the database at all for a bad token", async () => {
    await feedRequest("not-a-token");
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("serves a calendar document for a valid token", async () => {
    const token = await createCalendarFeedToken(CUSTOMER_ID);
    const response = await feedRequest(token);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/calendar; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="school-of-gaming.ics"',
    );
    // No shared cache may ever hold one family's schedule.
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(body).toContain("PRODID:-//School of Gaming//Sogverse//EN");
    expect(body).toContain("X-WR-CALNAME:School of Gaming");
    expect(body).toContain("BEGIN:VEVENT");
  });

  it("accepts the token with its optional .ics suffix", async () => {
    const token = await createCalendarFeedToken(CUSTOMER_ID);
    const response = await feedRequest(`${token}.ics`);
    expect(response.status).toBe(200);
  });

  it("titles events with the product and the gamer by default", async () => {
    const token = await createCalendarFeedToken(CUSTOMER_ID);
    const body = await (await feedRequest(token)).text();
    // The brand's spaced en dash, U+2013.
    expect(body).toContain("SUMMARY:Minecraft Club – Aino");
  });

  it("emits the default one-hour alarm, and none when asked for none", async () => {
    const token = await createCalendarFeedToken(CUSTOMER_ID);
    const withAlarm = await (await feedRequest(token)).text();
    expect(withAlarm).toContain("TRIGGER:-PT60M");

    const without = await (await feedRequest(token, "?alarm=none")).text();
    expect(without).not.toContain("BEGIN:VALARM");
  });

  it("states one weekly rule per slot in rrule mode", async () => {
    const token = await createCalendarFeedToken(CUSTOMER_ID);
    const body = await (await feedRequest(token, "?mode=rrule")).text();
    expect(body).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO");
    // A recurring event is always a wall clock in the product's zone.
    expect(body).toContain("DTSTART;TZID=Europe/Helsinki:");
    expect(body).toContain("BEGIN:VTIMEZONE");
    expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("renders the same events as JSON on request", async () => {
    const token = await createCalendarFeedToken(CUSTOMER_ID);
    const response = await feedRequest(token, "?format=json");
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(data.events)).toBe(true);
    expect(data.events.length).toBeGreaterThan(0);
    expect(data.events[0]).toMatchObject({
      summary: "Minecraft Club – Aino",
      gamerName: "Aino",
      productName: "Minecraft Club",
      productType: "consumer_club",
      recurring: false,
    });
  });

  it("narrows to one gamer when the scope names one, and ignores an unknown one", async () => {
    const token = await createCalendarFeedToken(CUSTOMER_ID);
    const mine = await (
      await feedRequest(token, `?format=json&scope=gamer:${PARTICIPANT_ID}`)
    ).json();
    expect(mine.events.length).toBeGreaterThan(0);

    const other = await (
      await feedRequest(
        token,
        "?format=json&scope=gamer:99999999-9999-9999-9999-999999999999",
      )
    ).json();
    expect(other.events).toEqual([]);
  });

  it("keeps working on an option value it does not recognise", async () => {
    const token = await createCalendarFeedToken(CUSTOMER_ID);
    const response = await feedRequest(token, "?mode=fortnightly&alarm=97");
    expect(response.status).toBe(200);
    // Both fell back to their defaults rather than 400.
    const body = await response.text();
    expect(body).toContain("TRIGGER:-PT60M");
    expect(body).not.toContain("RRULE:");
  });

  it("clamps a canceling subscription to its paid-through instant", async () => {
    // Nothing is paid for after this, so the walk emits no future occurrence.
    mockAdminFrom.mockImplementation(
      tables({
        family_subscriptions: {
          data: [
            {
              participation_id: PARTICIPATION_ID,
              current_period_end: "2020-02-01T00:00:00.000Z",
            },
          ],
          error: null,
        },
      }),
    );
    const token = await createCalendarFeedToken(CUSTOMER_ID);
    const data = await (await feedRequest(token, "?format=json")).json();
    expect(data.events).toEqual([]);
  });
});

// --- Mint route ---

function mintRequest(body: unknown): Request {
  return new Request("https://test.sogverse.local/api/admin/calendar-feed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAdminCaller(overrides: Record<string, ChainResult> = {}) {
  const from = tables(overrides);
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin", locale: "en" },
    supabase: { from: (table: string) => from(table) },
  });
}

describe("POST /api/admin/calendar-feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const response = await POST(mintRequest({ customer: CUSTOMER_ID }));
    expect(response.status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const response = await POST(mintRequest({ customer: CUSTOMER_ID }));
    expect(response.status).toBe(403);
  });

  it("rejects a body without a customer", async () => {
    mockAdminCaller();
    const response = await POST(mintRequest({}));
    expect(response.status).toBe(400);
  });

  it("mints a token that the feed verifier accepts", async () => {
    mockAdminCaller();
    const response = await POST(mintRequest({ customer: CUSTOMER_ID }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.customerId).toBe(CUSTOMER_ID);
    expect(data.customerName).toBe("Riikka Virtanen");
    expect(await verifyCalendarFeedToken(data.token)).toBe(CUSTOMER_ID);
  });

  it("lists the seats and the gamers the feed covers", async () => {
    mockAdminCaller();
    const data = await (
      await POST(mintRequest({ customer: "riikka@example.test" }))
    ).json();

    expect(data.gamers).toEqual([
      { participantId: PARTICIPANT_ID, firstName: "Aino" },
    ]);
    expect(data.participations).toEqual([
      {
        id: PARTICIPATION_ID,
        participantFirstName: "Aino",
        productName: "Minecraft Club",
        productType: "consumer_club",
      },
    ]);
  });

  it("answers 404 with a message naming the value that resolved to nothing", async () => {
    mockAdminCaller({ profiles: { data: null, error: null } });
    const response = await POST(mintRequest({ customer: "nobody@example.test" }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain("nobody@example.test");
  });
});
