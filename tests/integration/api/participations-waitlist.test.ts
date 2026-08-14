import { describe, it, expect, vi, beforeEach } from "vitest";

// The confirmation mail's My SOG link comes from getOrigin(), which falls back
// to NEXT_PUBLIC_SITE_URL when the request carries no trusted Host.
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

import { DELETE, POST } from "@/app/api/participations/waitlist/route";
import { NextResponse } from "next/server";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockSendTransactionalEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    mockSendTransactionalEmail(...args),
}));

// The route runs on the USER-bound client from `requireRole`, so the RPC mock
// hangs off the `supabase` handed back by that mock rather than off the admin
// client — which this route no longer touches at all. The confirmation mail
// reads through the very same client, deliberately: everything behind it is a
// read this parent may already make.
const mockRpc = vi.fn();
const mockFrom = vi.fn();

// --- Fixtures ---

const CUSTOMER_ID = "11111111-1111-1111-1111-111111111111";
const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";
const GAMER_ID = "33333333-3333-3333-3333-333333333333";
const PARTICIPATION_ID = "44444444-4444-4444-4444-444444444444";

function createRequest(
  body: unknown,
  { rawBody }: { rawBody?: string } = {},
): Request {
  return new Request("http://localhost:3000/api/participations/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody ?? JSON.stringify(body),
  });
}

/** The same collection, addressed with DELETE — giving up a spot. */
function createDeleteRequest(
  body: unknown,
  { rawBody }: { rawBody?: string } = {},
): Request {
  return new Request("http://localhost:3000/api/participations/waitlist", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: rawBody ?? JSON.stringify(body),
  });
}

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function mockForbidden(role: string) {
  mockRequireRole.mockImplementation(
    (requiredRole: string, options?: { forbiddenMessage?: string }) => {
      if (role !== requiredRole) {
        return Promise.resolve(
          NextResponse.json(
            { error: options?.forbiddenMessage ?? "Forbidden" },
            { status: 403 },
          ),
        );
      }
      return Promise.resolve({
        user: { id: CUSTOMER_ID },
        profile: { role },
        supabase: { rpc: mockRpc, from: mockFrom },
      });
    },
  );
}

function mockAuthenticatedCustomer() {
  mockRequireRole.mockResolvedValue({
    user: { id: CUSTOMER_ID },
    profile: {
      id: CUSTOMER_ID,
      role: "customer",
      email: "parent@example.test",
      locale: "en",
    },
    supabase: { rpc: mockRpc, from: mockFrom },
  });
}

/**
 * The two reads behind the confirmation mail, on the caller's own client: the
 * product with its translations, and both people in one query (on a self seat
 * they are the same row).
 */
function mockReadsForConfirmationEmail(
  { participantFirstName = "Aino" }: { participantFirstName?: string } = {},
) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "products") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    product_type: "consumer_club",
                    product_translations: [{ locale: "en", name: "Test Club" }],
                  },
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({
          in: () =>
            Promise.resolve({
              data: [
                {
                  id: CUSTOMER_ID,
                  first_name: "Marja",
                  email: "parent@example.test",
                  locale: "en",
                },
                {
                  id: GAMER_ID,
                  first_name: participantFirstName,
                  email: null,
                  locale: null,
                },
              ],
              error: null,
            }),
        }),
      };
    }
    // A waitlist join states no price, so `product_prices` is never read.
    throw new Error(`Unexpected table in the caller's client mock: ${table}`);
  });
}

// --- Tests ---

describe("POST /api/participations/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "msg-1" });
    mockReadsForConfirmationEmail();
  });

  // -- Auth --

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for gamer role", async () => {
    mockForbidden("gamer");

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("Only customers can join a waitlist");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for gedu role", async () => {
    mockForbidden("gedu");

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for admin role", async () => {
    mockForbidden("admin");

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- Validation --

  it("returns 400 when JSON is malformed", async () => {
    mockAuthenticatedCustomer();

    const res = await POST(createRequest(null, { rawBody: "{not-json" }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid JSON body");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when productId is missing", async () => {
    mockAuthenticatedCustomer();

    const res = await POST(createRequest({ participantId: GAMER_ID }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/(productId|participantId): Required/);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when participantId is missing", async () => {
    mockAuthenticatedCustomer();

    const res = await POST(createRequest({ productId: PRODUCT_ID }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/(productId|participantId): Required/);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- Happy path --

  it("returns the new waitlist position when join_waitlist succeeds", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: {
        participation_id: PARTICIPATION_ID,
        waitlist_position: 3,
        status: "waitlisted",
      },
      error: null,
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      participationId: PARTICIPATION_ID,
      waitlistPosition: 3,
      status: "waitlisted",
    });
    expect(mockRpc).toHaveBeenCalledWith("join_product_waitlist", {
      p_product_id: PRODUCT_ID,
      p_participant_id: GAMER_ID,
    });
  });

  it("is idempotent — returns the existing row's position when the gamer is already on the waitlist", async () => {
    mockAuthenticatedCustomer();
    // The RPC itself short-circuits on existing participation rows; the route
    // just relays whatever shape the RPC returns. This locks in that contract.
    mockRpc.mockResolvedValue({
      data: {
        participation_id: PARTICIPATION_ID,
        waitlist_position: 1,
        status: "waitlisted",
      },
      error: null,
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.waitlistPosition).toBe(1);
  });

  // -- RPC error mapping --

  it("returns 400 when waitlist is not enabled for the product (RPC raises check_violation)", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "waitlist is not enabled for this product",
      },
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("waitlist is not enabled for this product");
  });

  it("returns 400 when the customer is not the parent of the gamer (IDOR guard)", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: `customer ${CUSTOMER_ID} is not the parent of gamer ${GAMER_ID}`,
      },
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("is not the parent of gamer");
  });

  it("returns 403 when the RPC guard refuses the caller (42501)", async () => {
    // Defense in depth made visible: even if this route's own role check were
    // bypassed, `join_product_waitlist` refuses a non-customer in the database.
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Forbidden" },
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(403);
  });

  // -- The participant may be the caller --
  //
  // A for-parents product lets a customer queue for a seat of their own, which
  // arrives as `participantId === user.id`. The route judges nothing about that
  // pair: it never sends a customer id at all — `join_product_waitlist` reads
  // the caller from `auth.uid()` — so who may sit in the seat is entirely the
  // database's decision, under the same audience gate the signup path uses.

  it("forwards a self waitlist join without naming a customer", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: {
        participation_id: PARTICIPATION_ID,
        waitlist_position: 2,
        status: "waitlisted",
      },
      error: null,
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: CUSTOMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.waitlistPosition).toBe(2);
    expect(mockRpc).toHaveBeenCalledWith("join_product_waitlist", {
      p_product_id: PRODUCT_ID,
      p_participant_id: CUSTOMER_ID,
    });
    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty("p_customer_id");
  });

  it("relays the RPC's refusal for an adult who is not the caller", async () => {
    // Forwarded, then refused in the database — the shape a route-side check
    // would have hidden. The message is the RPC's own, because that is what the
    // signup panel renders.
    mockAuthenticatedCustomer();
    const otherAdult = "99999999-9999-9999-9999-999999999999";
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: `customer ${CUSTOMER_ID} is not the parent of participant ${otherAdult}`,
      },
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: otherAdult }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("is not the parent of participant");
    expect(mockRpc).toHaveBeenCalledWith("join_product_waitlist", {
      p_product_id: PRODUCT_ID,
      p_participant_id: otherAdult,
    });
  });

  it("relays the RPC's audience refusal on a gamers-only product", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "this product is not open to parents" },
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: CUSTOMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("this product is not open to parents");
  });

  it("returns 400 when the product does not exist", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "P0002",
        message: `product ${PRODUCT_ID} does not exist`,
      },
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("does not exist");
  });

  // -- The confirmation mail --

  function joinsWaitlist() {
    mockRpc.mockResolvedValue({
      data: {
        participation_id: PARTICIPATION_ID,
        waitlist_position: 3,
        status: "waitlisted",
      },
      error: null,
    });
  }

  it("mails the customer when the spot is taken", async () => {
    mockAuthenticatedCustomer();
    joinsWaitlist();

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(200);
    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
    const sent = mockSendTransactionalEmail.mock.calls[0][0];
    expect(sent.toEmail).toBe("parent@example.test");
    expect(sent.replyToEmail).toBe("help@sog.gg");
    expect(sent.subject).toContain("waitlist");
    expect(sent.subject).toContain("Aino");
  });

  // The card in My SOG reads the position live; a number frozen into an inbox
  // goes stale the moment somebody ahead drops out, with no way for the reader
  // to tell.
  it("states no position and no price in the mail", async () => {
    mockAuthenticatedCustomer();
    joinsWaitlist();

    await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    const { htmlContent } = mockSendTransactionalEmail.mock.calls[0][0];
    expect(htmlContent).not.toContain("Price");
    // It points at the live answer instead of freezing one.
    expect(htmlContent).toContain("where you stand in My SOG");
    // The request carries no trusted Host, so the link falls back to the
    // canonical site URL rather than to anything the request could name.
    expect(htmlContent).toContain("https://test.sogverse.local/parent");
  });

  it("sends nothing when the join is refused", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "waitlist is not enabled for this product",
      },
    });

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(400);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("still joins the waitlist when the send throws", async () => {
    mockAuthenticatedCustomer();
    joinsWaitlist();
    mockSendTransactionalEmail.mockRejectedValue(new Error("Brevo 502"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, participantId: GAMER_ID }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      participationId: PARTICIPATION_ID,
      waitlistPosition: 3,
      status: "waitlisted",
    });
    spy.mockRestore();
  });
});

describe("DELETE /api/participations/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Auth --

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );

    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for gamer role — a kid can't give up their own place in line", async () => {
    mockForbidden("gamer");

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("Only customers can leave a waitlist");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for gedu role", async () => {
    mockForbidden("gedu");

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );

    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for admin role", async () => {
    mockForbidden("admin");

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );

    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- Validation --

  it("returns 400 when JSON is malformed", async () => {
    mockAuthenticatedCustomer();

    const res = await DELETE(
      createDeleteRequest(null, { rawBody: "{not-json" }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid JSON body");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when participationId is missing", async () => {
    mockAuthenticatedCustomer();

    const res = await DELETE(createDeleteRequest({}));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/participationId/);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // -- Happy path --

  it("relays the participation id to the RPC and returns the outcome kind", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: {
        kind: "left",
        participation_id: PARTICIPATION_ID,
        product_id: PRODUCT_ID,
      },
      error: null,
    });

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    // Only the kind crosses the wire; the ids the RPC echoes back are ones the
    // caller already had, so the response schema drops them.
    expect(data).toEqual({ kind: "left" });
    expect(mockRpc).toHaveBeenCalledWith("leave_my_waitlist_spot", {
      p_participation_id: PARTICIPATION_ID,
    });
    // The caller's identity is never a parameter — the RPC reads auth.uid().
    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty("p_customer_id");
  });

  it("returns 200 with kind 'noop' when the row was already promoted", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: { kind: "noop", status: "active" },
      error: null,
    });

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ kind: "noop" });
  });

  it("returns 200 with kind 'not_found' rather than a 404 for someone else's row", async () => {
    // The RPC deliberately answers "not yours" and "not real" identically. A
    // 404 here would hand that distinction back to a prober via the status
    // code, so every outcome is a 200 carrying its kind.
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({ data: { kind: "not_found" }, error: null });

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ kind: "not_found" });
  });

  // -- RPC error mapping --

  it("returns 403 when the RPC guard refuses the caller (42501)", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Forbidden" },
    });

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );

    expect(res.status).toBe(403);
  });

  it("returns 500 without disclosing the message when the RPC shape is unexpected", async () => {
    mockAuthenticatedCustomer();
    mockRpc.mockResolvedValue({ data: { kind: "teleported" }, error: null });

    const res = await DELETE(
      createDeleteRequest({ participationId: PARTICIPATION_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(500);
    // This route doesn't opt into disclosure — unlike the POST above, none of
    // its outcomes are written for a parent to read.
    expect(data.error).toBe("Internal server error");
  });
});
