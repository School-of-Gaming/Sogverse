import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The staff mail's admin link comes from getOrigin(), which falls back to
// NEXT_PUBLIC_SITE_URL when the request carries no trusted Host.
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

import { NextResponse } from "next/server";
import { POST } from "@/app/api/admin/seat-offers/sweep/route";

/**
 * The lazy expiry sweep, called on admin page mount.
 *
 * Exactly-once is the RPC's job — the claim and the mark are one statement — so
 * what this file covers is the route's own half: the role gate, that the count
 * is claimed inside the answer and the mails outside it, and that a Brevo
 * outage cannot turn a successful claim into a failed request.
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

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const CUSTOMER_ID = "66666666-6666-4666-8666-666666666666";
const GAMER_ID = "77777777-7777-4777-8777-777777777777";

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
                schedule_slots: [{ weekday: 1, start_time: "16:00:00" }],
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
    }),
  };
}

function claimedRow(participationId: string) {
  return {
    participation_id: participationId,
    product_id: PRODUCT_ID,
    customer_id: CUSTOMER_ID,
    participant_id: GAMER_ID,
    sent_at: "2026-08-20T10:00:00.123+00:00",
  };
}

function mockAuthenticatedAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: {},
  });
}

function request(): Request {
  return new Request("http://localhost:3000/api/admin/seat-offers/sweep", {
    method: "POST",
  });
}

describe("POST /api/admin/seat-offers/sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deferred.length = 0;
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "m1" });
    mockAdminRpc.mockResolvedValue({ data: [], error: null });
  });

  afterEach(async () => {
    await settleDeferred();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Only admins can sweep seat offers" },
        { status: 403 },
      ),
    );

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  /** The ordinary case by a wide margin: somebody looked and nothing was due. */
  it("claims nothing and mails nobody on an empty sweep", async () => {
    mockAuthenticatedAdmin();

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 0 });
    expect(mockAdminRpc).toHaveBeenCalledWith(
      "claim_expired_seat_offer_notifications",
    );
    expect(deferred).toHaveLength(0);
    await settleDeferred();
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("reports the count in the answer and mails one staff copy per claim", async () => {
    mockAuthenticatedAdmin();
    mockAdminRpc.mockResolvedValue({
      data: [
        claimedRow("44444444-4444-4444-4444-444444444444"),
        claimedRow("55555555-5555-4555-8555-555555555555"),
      ],
      error: null,
    });

    const response = await POST(request());

    // The count is inside the answer; the mails are outside it.
    expect(await response.json()).toEqual({ claimed: 2 });
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();

    await settleDeferred();
    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(2);
    const sent = mockSendTransactionalEmail.mock.calls[0][0];
    expect(sent.toEmail).toBe("help@sog.gg");
    expect(sent.subject).toContain("No answer");
  });

  /**
   * The claim is committed the moment the RPC returns, so a failing send must
   * not make the caller think nothing happened — those offers are already
   * marked notified and will not be claimed again.
   */
  it("still reports the count when a staff mail throws", async () => {
    mockAuthenticatedAdmin();
    mockAdminRpc.mockResolvedValue({
      data: [claimedRow("44444444-4444-4444-4444-444444444444")],
      error: null,
    });
    mockSendTransactionalEmail.mockRejectedValue(new Error("brevo is down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request());
    await settleDeferred();

    expect(await response.json()).toEqual({ claimed: 1 });
    spy.mockRestore();
  });

  it("answers a generic 500 when the claim returns an unexpected shape", async () => {
    mockAuthenticatedAdmin();
    mockAdminRpc.mockResolvedValue({ data: { nope: true }, error: null });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("Internal server error");
    spy.mockRestore();
  });
});
