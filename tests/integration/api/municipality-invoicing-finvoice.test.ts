import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/**
 * The Finvoice export route: one Fennoa customer's month as a file the CFO
 * imports.
 *
 * It reads the same admin-gated RPC the invoicing page reads, on the admin's
 * own session client, and answers with XML rather than JSON — so what this
 * suite is actually about is the three things a JSON route never has to get
 * right: the headers that make a browser save the file, the body being a
 * document rather than a payload, and a refusal still answering in the shape
 * every other route on this surface answers in.
 */

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockRpc = vi.fn();

import { GET } from "@/app/api/admin/municipality-invoicing/finvoice/route";

const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_CUSTOMER_ID = "22222222-2222-2222-2222-222222222222";

const CUSTOMER = {
  id: CUSTOMER_ID,
  fennoa_customer_no: "F0204",
  invoice_name: "Espoon kaupunki",
  street: "Virastokuja 1",
  postal_code: "02070",
  city: "Espoo",
  country_code: "FI",
  your_reference: "TIL-2026-0418",
  invoice_text: null,
};

/**
 * One club of one municipality, in the wire document's own vocabulary.
 *
 * The month is fixed and the sessions are literal dates well in the past, so
 * the route's own request-time clock — which it reads rather than takes — can
 * never move what this bills.
 */
function club(overrides: Record<string, unknown> = {}) {
  return {
    id: "club-a",
    timezone: "Europe/Helsinki",
    start_date: "2020-01-06",
    end_date: "2020-05-29",
    municipality_fee_cents: 6_500,
    product_translations: [{ locale: "fi", name: "Peliklubi Purola" }],
    schedule_slots: [
      { weekday: 0, start_time: "14:15", duration_minutes: 75 },
    ],
    location: {
      id: "loc-purola",
      name: "Purolan koulu",
      name_i18n: null,
      type: "site",
    },
    municipality: { id: "mun-espoo", name: "Espoo", name_i18n: null },
    invoice_customer: CUSTOMER,
    sessions: [
      { group_id: "g1", session_date: "2020-05-04" },
      { group_id: "g1", session_date: "2020-05-11" },
    ],
    ...overrides,
  };
}

function snapshot(clubs: unknown[] = [club()]) {
  return { month_start: "2020-05-01", clubs };
}

function request(query: string): Request {
  return new Request(
    `http://localhost:3000/api/admin/municipality-invoicing/finvoice${query}`,
  );
}

function mockAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-1" },
    profile: { role: "admin" },
    supabase: { rpc: mockRpc },
  });
}

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function mockNonAdmin() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json(
      { error: "Only admins can export municipality invoices" },
      { status: 403 },
    ),
  );
}

/**
 * Whether a string is well-formed XML, by the only check available here.
 *
 * There is no DOM in this project's node test environment and no XML parser in
 * its dependencies, and adding one to make a single assertion would be a
 * dependency carried by the whole app for a test. A stack over the tags proves
 * what actually matters about this response — that every element the serializer
 * opened it also closed, in order, with one root — which is the property a
 * missing escape or a half-written row breaks.
 */
function xmlElementStack(xml: string): { ok: boolean; detail: string } {
  const body = xml.replace(/^<\?xml[^?]*\?>\s*/, "");
  const stack: string[] = [];
  for (const [, closing, name] of body.matchAll(/<(\/?)([A-Za-z][\w.-]*)[^>]*>/g)) {
    if (closing === "") {
      stack.push(name);
      continue;
    }
    const open = stack.pop();
    if (open !== name) {
      return { ok: false, detail: `</${name}> closed <${open ?? "nothing"}>` };
    }
  }
  return stack.length === 0
    ? { ok: true, detail: "" }
    : { ok: false, detail: `unclosed: ${stack.join(", ")}` };
}

describe("GET /api/admin/municipality-invoicing/finvoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: snapshot(), error: null });
  });

  // -- Auth --

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await GET(
      request(`?month=2020-05&customer=${CUSTOMER_ID}`),
    );

    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin", async () => {
    mockNonAdmin();

    const response = await GET(
      request(`?month=2020-05&customer=${CUSTOMER_ID}`),
    );

    expect(response.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- Input --

  it("returns 400 for a malformed month", async () => {
    mockAdmin();

    const response = await GET(
      request(`?month=2020-13&customer=${CUSTOMER_ID}`),
    );

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 for a month outside this century", async () => {
    // Spelled correctly and naming a month nobody has ever invoiced. The page
    // route falls back to a default for one of these; a file cannot.
    mockAdmin();

    const response = await GET(
      request(`?month=0007-03&customer=${CUSTOMER_ID}`),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when the customer is not a uuid", async () => {
    mockAdmin();

    const response = await GET(request("?month=2020-05&customer=espoo"));

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when the month is missing altogether", async () => {
    mockAdmin();

    const response = await GET(request(`?customer=${CUSTOMER_ID}`));

    expect(response.status).toBe(400);
  });

  // -- The file --

  it("answers with the customer's Finvoice file", async () => {
    mockAdmin();

    const response = await GET(
      request(`?month=2020-05&customer=${CUSTOMER_ID}`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="invoice_202005_F0204.xml"',
    );
    // An invoice is recomputed from today's fees every time it is asked for, so
    // a cached copy can quietly disagree with the ledger it was checked against.
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const xml = await response.text();
    expect(xmlElementStack(xml)).toEqual({ ok: true, detail: "" });
    // The one element the whole feature turns on: Fennoa matches the buyer on
    // it, and an identifier that is not a customer number creates a customer.
    expect(xml).toContain("<BuyerPartyIdentifier>F0204</BuyerPartyIdentifier>");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("reads the month the caller asked for, as the month's first day", async () => {
    mockAdmin();

    await GET(request(`?month=2020-05&customer=${CUSTOMER_ID}`));

    expect(mockRpc).toHaveBeenCalledWith("get_admin_municipality_invoicing", {
      p_month_start: "2020-05-01",
    });
  });

  it("builds the file in Finnish whatever the admin reads the ledger in", async () => {
    // The file goes to a Finnish municipality's accounts payable, so the
    // Swedish exonym of a municipality must not reach it.
    mockAdmin();
    mockRpc.mockResolvedValue({
      data: snapshot([
        club({
          municipality: {
            id: "mun-espoo",
            name: "Espoo",
            name_i18n: { sv: "Esbo" },
          },
        }),
      ]),
      error: null,
    });

    const xml = await (
      await GET(request(`?month=2020-05&customer=${CUSTOMER_ID}`))
    ).text();

    expect(xml).toContain("<RowFreeText>Espoo - Purolan koulu");
    expect(xml).not.toContain("Esbo");
  });

  // -- The refusals --

  it("returns 409 when one of the customer's clubs has no fee", async () => {
    mockAdmin();
    mockRpc.mockResolvedValue({
      data: snapshot([
        club(),
        club({ id: "club-b", municipality_fee_cents: null }),
      ]),
      error: null,
    });

    const response = await GET(
      request(`?month=2020-05&customer=${CUSTOMER_ID}`),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: expect.stringContaining("no fee set"),
      code: "club_without_fee",
    });
  });

  it("returns 409 when nothing in the month is invoiced to that customer", async () => {
    mockAdmin();

    const response = await GET(
      request(`?month=2020-05&customer=${OTHER_CUSTOMER_ID}`),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: expect.any(String),
      code: "unknown_customer",
    });
  });

  it("returns 409 when the customer's clubs recorded nothing", async () => {
    mockAdmin();
    mockRpc.mockResolvedValue({
      data: snapshot([club({ sessions: [] })]),
      error: null,
    });

    const response = await GET(
      request(`?month=2020-05&customer=${CUSTOMER_ID}`),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: expect.any(String),
      code: "nothing_to_invoice",
    });
  });

  // -- The read behind it --

  it("maps the guard's refusal off the wire to a 403", async () => {
    // The RPC is guard-first on `assert_admin`, so the role gate here is the
    // first of two layers rather than the only one.
    mockAdmin();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    const response = await GET(
      request(`?month=2020-05&customer=${CUSTOMER_ID}`),
    );

    expect(response.status).toBe(403);
  });
});
