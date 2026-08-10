import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { DELETE } from "@/app/api/admin/products/[id]/participations/[participationId]/route";
import { getBoolean, getString } from "../../helpers/json";

// The admin remove-gamer route is now one call: `admin_remove_participation` on
// the USER-bound client. The product-membership check and the live-subscription
// refusal live in that RPC — where the latter finally shares a transaction with
// the delete instead of racing it. (A consumer-club gate sat beside them until
// clubs became free-or-paid; the live-sub refusal is what it was standing in
// for, and it covers every type.) What this
// file covers is the handler's remaining job: the role check and the mapping
// from SQLSTATE to HTTP status. The rules themselves are covered against a real
// database in tests/db/admin-participation-rpcs.test.ts.

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockRpc = vi.fn();

function mockAuthenticatedAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
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
      { error: "Only admins can remove gamers from a product" },
      { status: 403 },
    ),
  );
}

function rpcFails(code: string, message = "refused") {
  mockRpc.mockResolvedValue({ data: null, error: { code, message } });
}

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const PARTICIPATION_ID = "44444444-4444-4444-4444-444444444444";

function createRequest(): Request {
  return new Request(
    `http://localhost/api/admin/products/x/participations/y`,
    { method: "DELETE" },
  );
}

const params = Promise.resolve({
  id: PRODUCT_ID,
  participationId: PARTICIPATION_ID,
});

beforeEach(() => {
  mockRequireRole.mockReset();
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({
    data: {
      kind: "cancelled",
      product_id: PRODUCT_ID,
      previous_status: "active",
      stripe_subscription_id: null,
      reason: "admin_cancelled",
    },
    error: null,
  });
});

describe("DELETE /api/admin/products/[id]/participations/[participationId]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockUnauthenticated();
    const response = await DELETE(createRequest(), { params });
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not an admin", async () => {
    mockNonAdmin();
    const response = await DELETE(createRequest(), { params });
    expect(response.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 when the RPC guard refuses the caller", async () => {
    mockAuthenticatedAdmin();
    rpcFails("42501", "Forbidden");
    const response = await DELETE(createRequest(), { params });
    expect(response.status).toBe(403);
  });

  it("returns 404 when the participation is unknown or on another product", async () => {
    // One refusal covers both: the RPC checks the (product, participation) pair,
    // so an id from another product is indistinguishable from a missing one —
    // which is the correct answer to give, not a limitation.
    mockAuthenticatedAdmin();
    rpcFails("P0002", "participation is not on product");
    const response = await DELETE(createRequest(), { params });
    expect(response.status).toBe(404);
    // The status carries the meaning; the body is the shared table's generic
    // message, because the RPC's own text names rows the admin never asked for.
    const error = getString(await response.json(), "error");
    expect(error).toBe("Not found");
  });

  it("maps a check violation to the shared table's generic 400", async () => {
    // This used to be the consumer-club refusal, with copy of its own. That
    // refusal is gone from the RPC: without admin removal a *free* club has no
    // exit at all, and a hard-capped one could never free a seat. What is left
    // for 23514 is any other check the RPC's delegate might trip, which has no
    // admin-facing story — so it gets the generic message.
    mockAuthenticatedAdmin();
    rpcFails("23514", "some check the admin never asked about");
    const response = await DELETE(createRequest(), { params });
    expect(response.status).toBe(400);
    const error = getString(await response.json(), "error");
    expect(error).toBe("Invalid request");
  });

  it("refuses (500) when a live Stripe subscription is still linked", async () => {
    // Money-path guard: deleting would CASCADE-orphan the subscription, billing
    // the customer forever. Unreachable under current invariants, but must fail
    // loud rather than silently delete if it ever happens.
    mockAuthenticatedAdmin();
    rpcFails("55000", "participation still has live Stripe subscription sub_123");
    const response = await DELETE(createRequest(), { params });
    expect(response.status).toBe(500);
    const error = getString(await response.json(), "error");
    expect(error).toContain("live Stripe subscription");
  });

  it("returns a logged 500 for an unrecognized RPC error code", async () => {
    // Used to be a 400 carrying the raw message. A code the shared table does
    // not recognize is not the admin's mistake, so it is a server error.
    mockAuthenticatedAdmin();
    rpcFails("XX000", "boom");
    const response = await DELETE(createRequest(), { params });
    expect(response.status).toBe(500);
    const error = getString(await response.json(), "error");
    expect(error).toBe("Internal server error");
  });

  it("returns 500 when the RPC result does not match its contract", async () => {
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({ data: { kind: "who-knows" }, error: null });
    const response = await DELETE(createRequest(), { params });
    expect(response.status).toBe(500);
  });

  it("happy path: passes both ids to the RPC and returns ok", async () => {
    mockAuthenticatedAdmin();
    const response = await DELETE(createRequest(), { params });

    expect(response.status).toBe(200);
    const okFlag = getBoolean(await response.json(), "ok");
    expect(okFlag).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("admin_remove_participation", {
      p_product_id: PRODUCT_ID,
      p_participation_id: PARTICIPATION_ID,
    });
  });
});
