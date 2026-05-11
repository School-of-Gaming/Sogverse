import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/admin/products-v2/[id]/participations/route";
import { mockSupabaseError, mockSupabaseSuccess } from "../../mocks/supabase";
import type { ProductTypeV2 } from "@/types";

// The admin add-gamer route does three reads and one write:
//   1. SELECT products_v2 (type gate — consumer_club blocked).
//   2. SELECT parent_gamer (resolves customer_id from the gamer).
//   3. INSERT participations_v2 (status='active', group_id=NULL).
// Direct insert is permitted by admin_full_access_participations_v2 RLS;
// the route deliberately bypasses create_participation_v2 to skip its
// payment / registration-window / seat-cap gates.

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
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
      { error: "Only admins can add gamers directly to a product" },
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

function err(message: string, code?: string): SupabaseResult<never> {
  return mockSupabaseError(message, code) as SupabaseResult<never>;
}

interface WireOptions {
  /** product fetch result — undefined means call shouldn't be reached. */
  product?: SupabaseResult<{ id: string; product_type: ProductTypeV2 } | null>;
  /** parent_gamer fetch result — array of links. */
  parentLink?: SupabaseResult<{ parent_id: string }[]>;
  /** Insert result. */
  insertResult?: SupabaseResult<{ id: string }>;
}

// Wires three from() calls in order: products_v2 (maybeSingle), parent_gamer
// (limit), participations_v2 (single from insert+select). The route always
// calls from() in this fixed order; the dispatch keeps tests from depending
// on call ordering hacks.
function wireSupabase(opts: WireOptions) {
  const productCall = {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve(opts.product ?? ok(null)),
      }),
    }),
  };

  const parentCall = {
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => Promise.resolve(opts.parentLink ?? ok([])),
        }),
      }),
    }),
  };

  const insertCall = {
    insert: () => ({
      select: () => ({
        single: () =>
          Promise.resolve(opts.insertResult ?? ok({ id: "new-part-id" })),
      }),
    }),
  };

  mockFrom.mockImplementation((table: string) => {
    if (table === "products_v2") return productCall;
    if (table === "parent_gamer") return parentCall;
    if (table === "participations_v2") return insertCall;
    throw new Error(`Unexpected from() table: ${table}`);
  });
}

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const GAMER_ID = "22222222-2222-2222-2222-222222222222";
const PARENT_ID = "33333333-3333-3333-3333-333333333333";

function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/products-v2/x/participations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: PRODUCT_ID });

beforeEach(() => {
  mockRequireRole.mockReset();
  mockFrom.mockReset();
});

describe("POST /api/admin/products-v2/[id]/participations", () => {
  it("returns 401 when unauthenticated", async () => {
    mockUnauthenticated();
    const response = await POST(createRequest({ gamerId: GAMER_ID }), { params });
    expect(response.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not an admin", async () => {
    mockNonAdmin();
    const response = await POST(createRequest({ gamerId: GAMER_ID }), { params });
    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 400 when body is not JSON", async () => {
    mockAuthenticatedAdmin();
    const response = await POST(createRequest("not-json"), { params });
    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 400 when gamerId is missing", async () => {
    mockAuthenticatedAdmin();
    const response = await POST(createRequest({}), { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("gamerId");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 404 when product does not exist", async () => {
    mockAuthenticatedAdmin();
    wireSupabase({ product: ok(null) });
    const response = await POST(createRequest({ gamerId: GAMER_ID }), { params });
    expect(response.status).toBe(404);
  });

  it("rejects consumer_club products (no comp path for recurring billing)", async () => {
    mockAuthenticatedAdmin();
    wireSupabase({
      product: ok({ id: PRODUCT_ID, product_type: "consumer_club" }),
    });
    const response = await POST(createRequest({ gamerId: GAMER_ID }), { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("consumer club");
  });

  it("returns 400 when gamer has no linked parent", async () => {
    mockAuthenticatedAdmin();
    wireSupabase({
      product: ok({ id: PRODUCT_ID, product_type: "camp" }),
      parentLink: ok([]),
    });
    const response = await POST(createRequest({ gamerId: GAMER_ID }), { params });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("parent");
  });

  it("returns 409 when the gamer is already enrolled", async () => {
    mockAuthenticatedAdmin();
    wireSupabase({
      product: ok({ id: PRODUCT_ID, product_type: "event" }),
      parentLink: ok([{ parent_id: PARENT_ID }]),
      insertResult: err(
        'duplicate key value violates unique constraint "uq_participations_v2_active_or_waitlisted"',
        "23505",
      ),
    });
    const response = await POST(createRequest({ gamerId: GAMER_ID }), { params });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("already enrolled");
  });

  it("happy path: inserts an active participation and returns the id", async () => {
    mockAuthenticatedAdmin();
    wireSupabase({
      product: ok({ id: PRODUCT_ID, product_type: "municipality_club" }),
      parentLink: ok([{ parent_id: PARENT_ID }]),
      insertResult: ok({ id: "new-participation-id" }),
    });
    const response = await POST(createRequest({ gamerId: GAMER_ID }), { params });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { participation_id: string };
    expect(body.participation_id).toBe("new-participation-id");
  });

  it("happy path works for camps too", async () => {
    mockAuthenticatedAdmin();
    wireSupabase({
      product: ok({ id: PRODUCT_ID, product_type: "camp" }),
      parentLink: ok([{ parent_id: PARENT_ID }]),
      insertResult: ok({ id: "camp-part-id" }),
    });
    const response = await POST(createRequest({ gamerId: GAMER_ID }), { params });
    expect(response.status).toBe(200);
  });
});
