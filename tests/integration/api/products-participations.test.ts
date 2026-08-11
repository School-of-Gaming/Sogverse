import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/admin/products/[id]/participations/route";
import { getString } from "../../helpers/json";

// The admin add-gamer route is now one call: `admin_enroll_participant` on the
// USER-bound client. The product-type gate, the parent resolution and the
// "already enrolled" constraint all live inside that RPC, behind an admin guard
// — so what this file covers is the handler's job, which is the role check, the
// body contract, and the mapping from SQLSTATE to HTTP status. The rules
// themselves are covered against a real database in
// tests/db/admin-participation-rpcs.test.ts.

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
      { error: "Only admins can add gamers directly to a product" },
      { status: 403 },
    ),
  );
}

function rpcFails(code: string, message = "refused") {
  mockRpc.mockResolvedValue({ data: null, error: { code, message } });
}

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const GAMER_ID = "22222222-2222-2222-2222-222222222222";
const PARENT_ID = "33333333-3333-3333-3333-333333333333";
const PARTICIPATION_ID = "44444444-4444-4444-4444-444444444444";

function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/products/x/participations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: PRODUCT_ID });

beforeEach(() => {
  mockRequireRole.mockReset();
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({
    data: { participation_id: PARTICIPATION_ID, customer_id: PARENT_ID },
    error: null,
  });
});

describe("POST /api/admin/products/[id]/participations", () => {
  it("returns 401 when unauthenticated", async () => {
    mockUnauthenticated();
    const response = await POST(createRequest({ participantId: GAMER_ID }), { params });
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not an admin", async () => {
    mockNonAdmin();
    const response = await POST(createRequest({ participantId: GAMER_ID }), { params });
    expect(response.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 when the RPC guard refuses the caller", async () => {
    // Defense in depth made visible: the admin gate is in the database too, so
    // a bypass of the handler's own check still gets nothing.
    mockAuthenticatedAdmin();
    rpcFails("42501", "Forbidden");
    const response = await POST(createRequest({ participantId: GAMER_ID }), { params });
    expect(response.status).toBe(403);
  });

  it("returns 400 when body is not JSON", async () => {
    mockAuthenticatedAdmin();
    const response = await POST(createRequest("not-json"), { params });
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when participantId is missing", async () => {
    mockAuthenticatedAdmin();
    const response = await POST(createRequest({}), { params });
    expect(response.status).toBe(400);
    const error = getString(await response.json(), "error");
    expect(error).toContain("participantId");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 404 when the product does not exist", async () => {
    mockAuthenticatedAdmin();
    rpcFails("P0002", "product does not exist");
    const response = await POST(createRequest({ participantId: GAMER_ID }), { params });
    expect(response.status).toBe(404);
  });

  it("returns 400 for the RPC's business-rule refusals", async () => {
    // consumer_club and "no linked parent" both come back as check_violation.
    mockAuthenticatedAdmin();
    rpcFails("23514", "admin enrollment is not supported for consumer clubs");
    const response = await POST(createRequest({ participantId: GAMER_ID }), { params });
    expect(response.status).toBe(400);
  });

  it("returns 409 when the gamer is already enrolled", async () => {
    mockAuthenticatedAdmin();
    rpcFails(
      "23505",
      'duplicate key value violates unique constraint "uq_participations_active_or_waitlisted"',
    );
    const response = await POST(createRequest({ participantId: GAMER_ID }), { params });
    expect(response.status).toBe(409);
    const error = getString(await response.json(), "error");
    expect(error).toContain("already enrolled");
  });

  it("returns 500 when the RPC result does not match its contract", async () => {
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({ data: { unexpected: true }, error: null });
    const response = await POST(createRequest({ participantId: GAMER_ID }), { params });
    expect(response.status).toBe(500);
  });

  it("happy path: calls the RPC with the URL product and returns the new id", async () => {
    mockAuthenticatedAdmin();
    const response = await POST(createRequest({ participantId: GAMER_ID }), { params });

    expect(response.status).toBe(200);
    const participationId = getString(await response.json(), "participation_id");
    expect(participationId).toBe(PARTICIPATION_ID);
    expect(mockRpc).toHaveBeenCalledWith("admin_enroll_participant", {
      p_product_id: PRODUCT_ID,
      p_participant_id: GAMER_ID,
    });
  });
});
