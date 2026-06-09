import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { DELETE } from "@/app/api/admin/products/[id]/participations/[participationId]/route";
import { mockSupabaseError, mockSupabaseSuccess } from "../../mocks/supabase";
import type { ProductType } from "@/types";

// The admin remove-gamer route does two reads and one RPC:
//   1. SELECT participations (IDOR guard — must belong to this product).
//   2. SELECT products (type gate — consumer_club blocked, symmetric w/ add).
//   3. RPC cancel_participation(reason='admin_cancelled') — hard delete, no
//      refund. cancel_participation is service_role-only, so the admin client.

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}));

function mockAuthenticatedAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: {},
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

type SupabaseResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string; code?: string } };

function ok<T>(data: T): SupabaseResult<T> {
  return mockSupabaseSuccess(data);
}

function err(message: string): SupabaseResult<never> {
  return mockSupabaseError(message) as SupabaseResult<never>;
}

interface WireOptions {
  participation?: SupabaseResult<{ id: string; product_id: string } | null>;
  product?: SupabaseResult<{ product_type: ProductType } | null>;
  rpcResult?: SupabaseResult<unknown>;
}

// Wires the two from() calls (participations, products — both
// select().eq().maybeSingle()) and the rpc() call. The route calls from() in a
// fixed order; dispatch by table keeps tests off call-ordering hacks.
function wireSupabase(opts: WireOptions) {
  const participationCall = {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve(opts.participation ?? ok(null)),
      }),
    }),
  };

  const productCall = {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve(opts.product ?? ok(null)),
      }),
    }),
  };

  mockFrom.mockImplementation((table: string) => {
    if (table === "participations") return participationCall;
    if (table === "products") return productCall;
    throw new Error(`Unexpected from() table: ${table}`);
  });

  mockRpc.mockResolvedValue(opts.rpcResult ?? ok({ kind: "cancelled" }));
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
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe("DELETE /api/admin/products/[id]/participations/[participationId]", () => {
  it("returns 401 when unauthenticated", async () => {
    mockUnauthenticated();
    const response = await DELETE(createRequest(), { params });
    expect(response.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not an admin", async () => {
    mockNonAdmin();
    const response = await DELETE(createRequest(), { params });
    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 404 when the participation does not exist", async () => {
    mockAuthenticatedAdmin();
    wireSupabase({ participation: ok(null) });
    const response = await DELETE(createRequest(), { params });
    expect(response.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 404 when the participation belongs to a different product (IDOR)", async () => {
    mockAuthenticatedAdmin();
    wireSupabase({
      participation: ok({ id: PARTICIPATION_ID, product_id: "other-product" }),
    });
    const response = await DELETE(createRequest(), { params });
    expect(response.status).toBe(404);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects consumer_club products (removal goes through Stripe, not here)", async () => {
    mockAuthenticatedAdmin();
    wireSupabase({
      participation: ok({ id: PARTICIPATION_ID, product_id: PRODUCT_ID }),
      product: ok({ product_type: "consumer_club" }),
    });
    const response = await DELETE(createRequest(), { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("consumer club");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when the RPC errors", async () => {
    mockAuthenticatedAdmin();
    wireSupabase({
      participation: ok({ id: PARTICIPATION_ID, product_id: PRODUCT_ID }),
      product: ok({ product_type: "camp" }),
      rpcResult: err("boom"),
    });
    const response = await DELETE(createRequest(), { params });
    expect(response.status).toBe(400);
  });

  it("happy path: cancels with admin_cancelled and returns ok", async () => {
    mockAuthenticatedAdmin();
    wireSupabase({
      participation: ok({ id: PARTICIPATION_ID, product_id: PRODUCT_ID }),
      product: ok({ product_type: "event" }),
      rpcResult: ok({ kind: "cancelled" }),
    });
    const response = await DELETE(createRequest(), { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith("cancel_participation", {
      p_participation_id: PARTICIPATION_ID,
      p_reason: "admin_cancelled",
    });
  });
});
