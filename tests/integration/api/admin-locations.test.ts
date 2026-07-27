import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/admin/locations/create/route";
import { PATCH } from "@/app/api/admin/locations/[id]/route";

/**
 * The locations CRUD routes moved off the service-role client in Phase 3 of the
 * DB authorization refactor: `authenticated` gained INSERT/UPDATE on the table
 * so the pre-existing admin_manage_locations policy could finally be the layer
 * that decides. These tests cover the four shapes the per-route checklist asks
 * for — unauthenticated, wrong role, bad input, happy path — plus the case that
 * only exists because of the conversion: the database refusing the write.
 */

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockFrom = vi.fn(() => ({ insert: mockInsert, update: mockUpdate }));

const LOCATION_ID = "00000000-0000-0000-0000-0000000000aa";
const PARENT_ID = "00000000-0000-0000-0000-0000000000ab";

const ROW = {
  id: LOCATION_ID,
  name: "Helsinki",
  name_i18n: null,
  type: "municipality",
  parent_id: PARENT_ID,
  country_code: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

/** `.insert(...).select().single()` / `.update(...).eq(...).select().single()`. */
function resolvesTo(result: { data: unknown; error: unknown }) {
  return { select: () => ({ single: () => Promise.resolve(result) }) };
}

function mockAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: { from: mockFrom },
  });
}

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function mockForbidden(message: string) {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: message }, { status: 403 }),
  );
}

function createRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/admin/locations/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown): Request {
  return new Request(
    `http://localhost:3000/api/admin/locations/${LOCATION_ID}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const params = Promise.resolve({ id: LOCATION_ID });

const validCreate = {
  name: "Helsinki",
  type: "municipality",
  parent_id: PARENT_ID,
  country_code: null,
};

// --- Tests ---

describe("POST /api/admin/locations/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate });
    mockInsert.mockReturnValue(resolvesTo({ data: ROW, error: null }));
  });

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const res = await POST(createRequest(validCreate));

    expect(res.status).toBe(401);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin", async () => {
    mockForbidden("Only admins can create locations");

    const res = await POST(createRequest(validCreate));
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("Only admins can create locations");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 400 when the body fails the contract schema", async () => {
    mockAdmin();

    const res = await POST(createRequest({ name: "", type: "municipality" }));

    expect(res.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("creates the location on the user-bound client", async () => {
    mockAdmin();

    const res = await POST(createRequest(validCreate));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual(ROW);
    expect(mockFrom).toHaveBeenCalledWith("locations");
    expect(mockInsert).toHaveBeenCalledWith(validCreate);
  });

  it("returns 403 when the database refuses the insert", async () => {
    mockAdmin();
    mockInsert.mockReturnValue(
      resolvesTo({
        data: null,
        error: { code: "42501", message: "permission denied for table locations" },
      }),
    );

    const res = await POST(createRequest(validCreate));

    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/admin/locations/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({ insert: mockInsert, update: mockUpdate });
    mockUpdate.mockReturnValue({
      eq: () => resolvesTo({ data: ROW, error: null }),
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const res = await PATCH(patchRequest({ name: "Espoo" }), { params });

    expect(res.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin", async () => {
    mockForbidden("Only admins can update locations");

    const res = await PATCH(patchRequest({ name: "Espoo" }), { params });

    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 400 for an empty name", async () => {
    mockAdmin();

    const res = await PATCH(patchRequest({ name: "   " }), { params });

    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("renames the location on the user-bound client", async () => {
    mockAdmin();

    const res = await PATCH(patchRequest({ name: "Espoo" }), { params });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual(ROW);
    expect(mockFrom).toHaveBeenCalledWith("locations");
    expect(mockUpdate).toHaveBeenCalledWith({ name: "Espoo" });
  });

  it("returns 403 when the policy refuses the update", async () => {
    mockAdmin();
    mockUpdate.mockReturnValue({
      eq: () =>
        resolvesTo({
          data: null,
          error: { code: "42501", message: "permission denied" },
        }),
    });

    const res = await PATCH(patchRequest({ name: "Espoo" }), { params });

    expect(res.status).toBe(403);
  });
});
