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
/** The top-level `.select(...)` — the create route's parent lookup uses it. */
const mockSelect = vi.fn();
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
}));

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

/** `.select(...).eq(...).single()` — the create route's parent lookup. */
function parentLookup(result: { data: unknown; error: unknown }) {
  return { eq: () => ({ single: () => Promise.resolve(result) }) };
}

/** What the parent lookup found, unless a test says otherwise. */
function mockParentCountry(countryCode: string | null) {
  mockSelect.mockReturnValue(
    parentLookup({ data: { country_code: countryCode }, error: null }),
  );
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
};

// --- Tests ---

describe("POST /api/admin/locations/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFrom.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    });
    mockParentCountry("FI");
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

  // `parent_id` goes into a `uuid` column and is read back by id on the way to
  // the country code, so a malformed one is a bad request rather than a missing
  // row: without the schema's `.uuid()` it reaches Postgres as a cast error and
  // is reported to the admin as a 500.
  it("returns 400 for a parent_id that is not a uuid, before any read", async () => {
    mockAdmin();

    const res = await POST(createRequest({ ...validCreate, parent_id: "not-a-uuid" }));

    expect(res.status).toBe(400);
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("creates the location on the user-bound client", async () => {
    mockAdmin();

    const res = await POST(createRequest(validCreate));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual(ROW);
    expect(mockFrom).toHaveBeenCalledWith("locations");
    expect(mockInsert).toHaveBeenCalledWith({
      ...validCreate,
      country_code: "FI",
    });
  });

  // `country_code` is denormalized onto every row so country filtering needs no
  // recursion, which makes the parent's code the only value that can be right.
  // A caller-supplied one is a second source of truth for a field with exactly
  // one — and country-scoping the site dialog depends on this holding for
  // every row, not for every well-behaved client.
  it("derives country_code from the parent and discards what the client sent", async () => {
    mockAdmin();
    mockParentCountry("FR");

    await POST(createRequest({ ...validCreate, country_code: "ZZ" }));

    expect(mockSelect).toHaveBeenCalledWith("country_code");
    expect(mockInsert).toHaveBeenCalledWith({
      ...validCreate,
      country_code: "FR",
    });
  });

  // PostgREST answers `.single()` with no row as PGRST116, which the route
  // deliberately swallows rather than turning into a 404 it invented: the
  // insert a moment later carries a foreign key on the same id, so the honest
  // error is the database's own. The country code falls through as null,
  // because there is no parent to take one from.
  it("falls through with a null country code when the parent does not exist", async () => {
    mockAdmin();
    mockSelect.mockReturnValue(
      parentLookup({ data: null, error: { code: "PGRST116", message: "no rows" } }),
    );
    mockInsert.mockReturnValue(
      resolvesTo({
        data: null,
        error: {
          code: "23503",
          message: 'insert or update on table "locations" violates foreign key constraint',
        },
      }),
    );

    const res = await POST(createRequest(validCreate));

    expect(mockInsert).toHaveBeenCalledWith({
      ...validCreate,
      country_code: null,
    });
    // The FK violation is what the caller sees, rather than a "no such parent"
    // this route would have had to guess at.
    expect(res.status).toBe(400);
  });

  it("reads no parent when there is none to read", async () => {
    mockAdmin();

    await POST(createRequest({ ...validCreate, parent_id: null }));

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledWith({
      ...validCreate,
      parent_id: null,
      country_code: null,
    });
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
    mockFrom.mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    });
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
