import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// Site notes are admin-only reference data attached to a location. The route
// upserts either or both halves (the member-facing address/notes and the
// staff-only notes) on the USER-bound client, so the admin-only write policies
// on both tables are the second layer behind the role gate.

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockUpsert = vi.fn();
const mockFrom = vi.fn(() => ({ upsert: mockUpsert }));

import { PATCH } from "@/app/api/admin/site-notes/route";

const LOCATION_ID = "00000000-0000-0000-0000-0000000000aa";

function patchRequest(body: unknown, rawBody?: string): Request {
  return new Request("http://localhost:3000/api/admin/site-notes", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: rawBody ?? JSON.stringify(body),
  });
}

function mockAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-1" },
    profile: { role: "admin" },
    supabase: { from: mockFrom },
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
      { error: "Only admins can edit site notes" },
      { status: 403 },
    ),
  );
}

describe("PATCH /api/admin/site-notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ error: null });
  });

  // -- Auth --

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await PATCH(
      patchRequest({ location_id: LOCATION_ID, staff: { notes: "x" } }),
    );

    expect(response.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin", async () => {
    mockNonAdmin();

    const response = await PATCH(
      patchRequest({ location_id: LOCATION_ID, staff: { notes: "x" } }),
    );

    expect(response.status).toBe(403);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  // -- Input --

  it("returns 400 for malformed JSON", async () => {
    mockAdmin();

    const response = await PATCH(patchRequest(null, "{not-json"));

    expect(response.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 when neither half is supplied", async () => {
    // Sending only the half being edited is the point of the shape; sending
    // neither is a no-op the route refuses rather than silently accepts.
    mockAdmin();

    const response = await PATCH(patchRequest({ location_id: LOCATION_ID }));

    expect(response.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 when location_id is missing", async () => {
    mockAdmin();

    const response = await PATCH(patchRequest({ staff: { notes: "x" } }));

    expect(response.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  // -- Happy path --

  it("upserts only the member half when only that half is sent", async () => {
    mockAdmin();

    const response = await PATCH(
      patchRequest({
        location_id: LOCATION_ID,
        member: { address: "  Kaisaniemenkatu 1  ", notes: "  Ring the bell " },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledWith("site_details");
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        location_id: LOCATION_ID,
        address: "Kaisaniemenkatu 1",
        notes: "Ring the bell",
      },
      { onConflict: "location_id" },
    );
  });

  it("upserts both halves when both are sent", async () => {
    mockAdmin();

    const response = await PATCH(
      patchRequest({
        location_id: LOCATION_ID,
        member: { notes: "Members" },
        staff: { notes: "Staff" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockFrom).toHaveBeenCalledWith("site_details");
    expect(mockFrom).toHaveBeenCalledWith("site_staff_details");
    expect(mockUpsert).toHaveBeenCalledTimes(2);
  });

  it("stores a blanked field as null rather than an empty string", async () => {
    mockAdmin();

    await PATCH(
      patchRequest({ location_id: LOCATION_ID, staff: { notes: "   " } }),
    );

    expect(mockUpsert).toHaveBeenCalledWith(
      { location_id: LOCATION_ID, notes: null },
      { onConflict: "location_id" },
    );
  });

  // -- Failure --

  it("maps a policy refusal to 403 through the shared error table", async () => {
    mockAdmin();
    mockUpsert.mockResolvedValue({
      error: { code: "42501", message: "permission denied for site_details" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await PATCH(
      patchRequest({ location_id: LOCATION_ID, member: { notes: "x" } }),
    );

    expect(response.status).toBe(403);
    // The driver's text names the table; the client gets the generic message.
    expect((await response.json()).error).toBe("Forbidden");
    spy.mockRestore();
  });

  it("maps an unknown location to a 400 foreign-key violation", async () => {
    mockAdmin();
    mockUpsert.mockResolvedValue({
      error: { code: "23503", message: "violates foreign key constraint" },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await PATCH(
      patchRequest({ location_id: LOCATION_ID, member: { notes: "x" } }),
    );

    expect(response.status).toBe(400);
    spy.mockRestore();
  });
});
