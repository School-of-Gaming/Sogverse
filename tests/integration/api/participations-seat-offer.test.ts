import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The staff mail's admin link comes from getOrigin(), which falls back to
// NEXT_PUBLIC_SITE_URL when the request carries no trusted Host.
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

import { NextResponse } from "next/server";
import { POST } from "@/app/api/participations/seat-offer/route";

/**
 * The in-app half of the seat offer: a parent answering from their My SOG card,
 * where the session is the credential and there is no token.
 *
 * The interesting property is the one this file exists to pin: the write goes
 * through the service-role client, so the caller's identity would vanish at
 * that boundary — and what puts it back is reading the row on the CALLER'S own
 * client first. A parent aiming this at another family's participation gets
 * nothing back from their own policies, and the route stops there.
 */

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (...args: unknown[]) => mockAdminRpc(...args),
    from: (table: string) => adminTableStub(table),
  }),
}));

const mockSendTransactionalEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    mockSendTransactionalEmail(...args),
}));

const deferred: unknown[] = [];
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (work: unknown) => {
      deferred.push(work);
    },
  };
});

async function settleDeferred(): Promise<void> {
  await Promise.all(deferred);
}

const PARTICIPATION_ID = "44444444-4444-4444-4444-444444444444";
const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const CUSTOMER_ID = "66666666-6666-4666-8666-666666666666";
const GAMER_ID = "77777777-7777-4777-8777-777777777777";
const SENT_AT = "2026-08-26T10:00:00.123+00:00";

/** The caller's own read, under their own RLS. */
const mockOwnRead = vi.fn();

function adminTableStub(table: string) {
  if (table === "products") {
    return {
      select: () => ({
        eq: () => ({
          order: () => ({
            single: async () => ({
              data: {
                product_type: "municipality_club",
                timezone: "Europe/Helsinki",
                product_translations: [{ locale: "en", name: "Minecraft 101" }],
                schedule_slots: [],
              },
              error: null,
            }),
          }),
        }),
      }),
    };
  }
  return {
    select: () => ({
      in: async () => ({
        data: [
          {
            id: CUSTOMER_ID,
            first_name: "Marja",
            last_name: "Virtanen",
            email: "marja@example.com",
            locale: "en",
          },
          {
            id: GAMER_ID,
            first_name: "Aino",
            last_name: null,
            email: "aino@gamer.sogverse.internal",
            locale: null,
          },
        ],
        error: null,
      }),
      // The staff mail's recipient list: every admin account, resolved at send
      // time off the role column rather than hardcoded to an inbox.
      eq: async () => ({
        data: [{ email: "ada@sog.gg" }, { email: "bo@sog.gg" }],
        error: null,
      }),
    }),
  };
}

function mockAuthenticatedCustomer() {
  mockRequireRole.mockResolvedValue({
    user: { id: CUSTOMER_ID },
    profile: { id: CUSTOMER_ID, role: "customer" },
    supabase: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: () => mockOwnRead() }) }),
      }),
    },
  });
}

function request(body: unknown, rawBody?: string): Request {
  return new Request("http://localhost:3000/api/participations/seat-offer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody ?? JSON.stringify(body),
  });
}

const accept = { participationId: PARTICIPATION_ID, accept: true };
const decline = { participationId: PARTICIPATION_ID, accept: false };

describe("POST /api/participations/seat-offer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deferred.length = 0;
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "m1" });
    mockOwnRead.mockResolvedValue({
      data: {
        id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
        status: "waitlisted",
        seat_offer_sent_at: SENT_AT,
      },
      error: null,
    });
    mockAdminRpc.mockResolvedValue({
      data: {
        kind: "accepted",
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
        group_id: null,
        customer_id: CUSTOMER_ID,
        participant_id: GAMER_ID,
      },
      error: null,
    });
  });

  afterEach(async () => {
    await settleDeferred();
  });

  // -- Auth --

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await POST(request(accept));

    expect(response.status).toBe(401);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for a role that is not a customer", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Only customers can answer a seat offer" },
        { status: 403 },
      ),
    );

    const response = await POST(request(accept));

    expect(response.status).toBe(403);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  // -- Input --

  it("returns 400 for malformed JSON", async () => {
    mockAuthenticatedCustomer();
    const response = await POST(request(null, "{not-json"));
    expect(response.status).toBe(400);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("returns 400 for a participation id that is not a UUID", async () => {
    mockAuthenticatedCustomer();
    const response = await POST(request({ participationId: "nope", accept: true }));
    expect(response.status).toBe(400);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  // -- The ownership check --

  /**
   * The IDOR guard, and it is the caller's own RLS doing the work rather than a
   * predicate this route writes: another family's row simply does not come
   * back. Nothing reaches the service-role client.
   */
  it("answers `invalid` and never calls the RPC when the row is not the caller's", async () => {
    mockAuthenticatedCustomer();
    mockOwnRead.mockResolvedValue({ data: null, error: null });

    const response = await POST(request(accept));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ outcome: "invalid" });
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("answers `invalid` when the row carries no offer", async () => {
    mockAuthenticatedCustomer();
    mockOwnRead.mockResolvedValue({
      data: {
        id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
        status: "waitlisted",
        seat_offer_sent_at: null,
      },
      error: null,
    });

    const response = await POST(request(accept));

    expect(await response.json()).toEqual({ outcome: "invalid" });
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  // -- The answers --

  it("passes the row's own stamp into the compare-and-swap", async () => {
    mockAuthenticatedCustomer();

    await POST(request(accept));

    expect(mockAdminRpc).toHaveBeenCalledWith("respond_seat_offer", {
      p_participation_id: PARTICIPATION_ID,
      p_offer_sent_at: SENT_AT,
      p_accept: true,
    });
  });

  it("answers `accepted` and mails nobody", async () => {
    mockAuthenticatedCustomer();

    const response = await POST(request(accept));

    expect(await response.json()).toEqual({ outcome: "accepted" });
    expect(deferred).toHaveLength(0);
    await settleDeferred();
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("answers `declined` and tells staff after the answer has gone out", async () => {
    mockAuthenticatedCustomer();
    mockAdminRpc.mockResolvedValue({
      data: {
        kind: "declined",
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
        customer_id: CUSTOMER_ID,
        participant_id: GAMER_ID,
      },
      error: null,
    });

    const response = await POST(request(decline));

    expect(await response.json()).toEqual({ outcome: "declined" });
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();

    await settleDeferred();
    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
    // Every admin account rather than an inbox — the same recipient list the
    // feedback notification resolves, off the role column.
    expect(mockSendTransactionalEmail.mock.calls[0][0].toEmail).toEqual([
      "ada@sog.gg",
      "bo@sog.gg",
    ]);
  });

  it("answers `expired` and sweeps when the window closed under the card", async () => {
    mockAuthenticatedCustomer();
    mockAdminRpc.mockResolvedValueOnce({
      data: {
        kind: "expired",
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
      },
      error: null,
    });
    mockAdminRpc.mockResolvedValue({ data: [], error: null });

    const response = await POST(request(accept));

    expect(await response.json()).toEqual({ outcome: "expired" });
    await settleDeferred();
    expect(mockAdminRpc).toHaveBeenCalledWith(
      "claim_expired_seat_offer_notifications",
    );
  });

  it("answers `declined` even when the staff mail throws", async () => {
    mockAuthenticatedCustomer();
    mockAdminRpc.mockResolvedValue({
      data: {
        kind: "declined",
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
        customer_id: CUSTOMER_ID,
        participant_id: GAMER_ID,
      },
      error: null,
    });
    mockSendTransactionalEmail.mockRejectedValue(new Error("brevo is down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request(decline));
    await settleDeferred();

    expect(await response.json()).toEqual({ outcome: "declined" });
    spy.mockRestore();
  });
});
