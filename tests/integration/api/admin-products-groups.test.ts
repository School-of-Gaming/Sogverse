import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/admin/products/[id]/groups/route";
import { NextResponse } from "next/server";
import { mockSupabaseSuccess, mockSupabaseError } from "../../mocks/supabase";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    rpc: mockAdminRpc,
  })),
}));

// Mock GroupsService.getProductGroups (called after RPC to refresh groups)
const mockGetProductGroups = vi.fn();
vi.mock("@/services/groups", () => ({
  GroupsService: vi.fn().mockImplementation(() => ({
    getProductGroups: mockGetProductGroups,
  })),
}));

// --- Helpers ---

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function mockForbidden() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json(
      { error: "Only admins can manage product groups" },
      { status: 403 },
    ),
  );
}

function mockAuthenticated() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: {},
  });
}

const validPayload = {
  addedGroups: [{ tempId: "temp-1", geduId: "gedu-1" }],
  updatedGroups: [{ groupId: "group-1", geduId: "gedu-2" }],
  deletedGroupIds: ["group-3"],
  enrollmentMoves: [
    { gamerId: "gamer-1", fromGroupId: "group-1", toGroupId: "group-2" },
  ],
};

function createRequest(body: Record<string, unknown> = validPayload): Request {
  return new Request("http://localhost:3000/api/admin/products/product-1/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "product-1" });

// --- Tests ---

describe("POST /api/admin/products/[id]/groups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Auth

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await POST(createRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 for non-admin roles", async () => {
    mockForbidden();

    const response = await POST(createRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Only admins can manage product groups");
  });

  // Product lookup

  it("returns 404 when product does not exist", async () => {
    mockAuthenticated();
    mockAdminFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(mockSupabaseError("Not found", "PGRST116")),
        }),
      }),
    });

    const response = await POST(createRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Product not found");
  });

  // RPC success

  it("returns groups and autoHidden on successful commit", async () => {
    mockAuthenticated();

    // Product exists
    mockAdminFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(mockSupabaseSuccess({ id: "product-1" })),
        }),
      }),
    });

    // RPC succeeds
    mockAdminRpc.mockResolvedValue(
      mockSupabaseSuccess({ autoHidden: false }),
    );

    // Refresh groups
    const refreshedGroups = [{ groupId: "g1", geduId: "gedu-1" }];
    mockGetProductGroups.mockResolvedValue(refreshedGroups);

    const response = await POST(createRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.groups).toEqual(refreshedGroups);
    expect(data.autoHidden).toBe(false);

    // Verify RPC was called with correct params
    expect(mockAdminRpc).toHaveBeenCalledWith("commit_group_changes", {
      p_product_id: "product-1",
      p_added_groups: validPayload.addedGroups,
      p_updated_groups: validPayload.updatedGroups,
      p_deleted_group_ids: validPayload.deletedGroupIds,
      p_enrollment_moves: validPayload.enrollmentMoves,
    });
  });

  it("returns autoHidden true when product is auto-hidden", async () => {
    mockAuthenticated();
    mockAdminFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(mockSupabaseSuccess({ id: "product-1" })),
        }),
      }),
    });
    mockAdminRpc.mockResolvedValue(mockSupabaseSuccess({ autoHidden: true }));
    mockGetProductGroups.mockResolvedValue([]);

    const response = await POST(createRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.autoHidden).toBe(true);
  });

  // RPC error

  it("returns 400 when RPC fails", async () => {
    mockAuthenticated();
    mockAdminFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(mockSupabaseSuccess({ id: "product-1" })),
        }),
      }),
    });
    mockAdminRpc.mockResolvedValue(
      mockSupabaseError("Gamer is already enrolled in another group for this product"),
    );

    const response = await POST(createRequest(), { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe(
      "Gamer is already enrolled in another group for this product",
    );
  });

  // Unexpected error

  it("returns 500 for unexpected errors", async () => {
    mockAuthenticated();

    const badRequest = new Request(
      "http://localhost:3000/api/admin/products/product-1/groups",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      },
    );

    const response = await POST(badRequest, { params });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");
  });
});
