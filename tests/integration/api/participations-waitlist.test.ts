import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/participations/waitlist/route";
import { NextResponse } from "next/server";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

// The route runs on the USER-bound client from `requireRole`, so the RPC mock
// hangs off the `supabase` handed back by that mock rather than off the admin
// client — which this route no longer touches at all.
const mockRpc = vi.fn();

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
        supabase: { rpc: mockRpc },
      });
    },
  );
}

function mockAuthenticatedCustomer() {
  mockRequireRole.mockResolvedValue({
    user: { id: CUSTOMER_ID },
    profile: { role: "customer" },
    supabase: { rpc: mockRpc },
  });
}

// --- Tests ---

describe("POST /api/participations/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Auth --

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, gamerId: GAMER_ID }),
    );

    expect(res.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for gamer role", async () => {
    mockForbidden("gamer");

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, gamerId: GAMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("Only customers can join a waitlist");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for gedu role", async () => {
    mockForbidden("gedu");

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, gamerId: GAMER_ID }),
    );

    expect(res.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for admin role", async () => {
    mockForbidden("admin");

    const res = await POST(
      createRequest({ productId: PRODUCT_ID, gamerId: GAMER_ID }),
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

    const res = await POST(createRequest({ gamerId: GAMER_ID }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/(productId|gamerId): Required/);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when gamerId is missing", async () => {
    mockAuthenticatedCustomer();

    const res = await POST(createRequest({ productId: PRODUCT_ID }));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toMatch(/(productId|gamerId): Required/);
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
      createRequest({ productId: PRODUCT_ID, gamerId: GAMER_ID }),
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
      p_gamer_id: GAMER_ID,
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
      createRequest({ productId: PRODUCT_ID, gamerId: GAMER_ID }),
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
      createRequest({ productId: PRODUCT_ID, gamerId: GAMER_ID }),
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
      createRequest({ productId: PRODUCT_ID, gamerId: GAMER_ID }),
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
      createRequest({ productId: PRODUCT_ID, gamerId: GAMER_ID }),
    );

    expect(res.status).toBe(403);
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
      createRequest({ productId: PRODUCT_ID, gamerId: GAMER_ID }),
    );
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain("does not exist");
  });
});
