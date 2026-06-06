import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/admin/products/[id]/groups/apply/route";
import type { GroupChangeSet } from "@/services/groups";

// The apply route is a thin wrapper around apply_group_changes — it
// validates auth, parses the JSON body, and forwards the change set to the RPC.
// Email notification + Daily.co provisioning live on the legacy route and stay
// out of scope here. These tests verify auth gating, body parsing, and
// error code mapping; the RPC's behavior is covered in db tests.

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
      { error: "Only admins can manage product groups" },
      { status: 403 },
    ),
  );
}

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";

const emptyBatch: GroupChangeSet = {
  addedGroups: [],
  renamedGroups: [],
  deletedGroupIds: [],
  geduAssignmentsAdded: [],
  geduAssignmentsRemoved: [],
  participationMoves: [],
};

function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/products/x/groups/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: PRODUCT_ID });

beforeEach(() => {
  mockRequireRole.mockReset();
  mockRpc.mockReset();
});

describe("POST /api/admin/products/[id]/groups/apply", () => {
  it("returns 401 when unauthenticated", async () => {
    mockUnauthenticated();
    const response = await POST(createRequest(emptyBatch), { params });
    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is not an admin", async () => {
    mockNonAdmin();
    const response = await POST(createRequest(emptyBatch), { params });
    expect(response.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns 400 when body is not JSON", async () => {
    mockAuthenticatedAdmin();
    const response = await POST(createRequest("not-json"), { params });
    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("forwards the change set to apply_group_changes in the right shape", async () => {
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({ data: { tempMap: {} }, error: null });

    const batch: GroupChangeSet = {
      addedGroups: [{ tempId: "t1", name: "Group A", geduIds: ["g1"] }],
      renamedGroups: [{ groupId: "G1", name: "Renamed" }],
      deletedGroupIds: ["G2"],
      geduAssignmentsAdded: [{ groupId: "G1", geduId: "g3" }],
      geduAssignmentsRemoved: [{ groupId: "G1", geduId: "g4" }],
      participationMoves: [
        { participationId: "p1", toGroupId: "G1" },
        { participationId: "p2", toGroupId: null },
      ],
    };

    const response = await POST(createRequest(batch), { params });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ tempMap: {} });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("apply_group_changes", {
      p_product_id: PRODUCT_ID,
      p_added_groups: batch.addedGroups,
      p_renamed_groups: batch.renamedGroups,
      p_deleted_group_ids: batch.deletedGroupIds,
      p_gedu_assignments_added: batch.geduAssignmentsAdded,
      p_gedu_assignments_removed: batch.geduAssignmentsRemoved,
      p_participation_moves: batch.participationMoves,
    });
  });

  it("returns the tempMap from the RPC unchanged", async () => {
    mockAuthenticatedAdmin();
    const tempMap = { t1: "real-uuid-1", t2: "real-uuid-2" };
    mockRpc.mockResolvedValue({ data: { tempMap }, error: null });

    const response = await POST(createRequest(emptyBatch), { params });
    const body = await response.json();
    expect(body).toEqual({ tempMap });
  });

  it("maps RPC error code P0002 to HTTP 404", async () => {
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Product not found", code: "P0002" },
    });

    const response = await POST(createRequest(emptyBatch), { params });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Product not found");
  });

  it("maps other RPC errors to HTTP 400", async () => {
    mockAuthenticatedAdmin();
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        message: "duplicate key value violates unique constraint",
        code: "23505",
      },
    });

    const response = await POST(createRequest(emptyBatch), { params });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("duplicate key");
  });
});
