// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { PATCH, DELETE } from "@/app/api/admin/product-images/[id]/route";
import {
  createFetchStubbedClient,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

/**
 * PATCH / DELETE /api/admin/product-images/[id] — rename and retire.
 *
 * Rename is the only mutation an entry allows, so the interesting part is the
 * refusals. Removal is the destructive one: the count of affected products is
 * read *before* the row goes (afterwards there is nothing left to count), and
 * a failed object removal must not turn a completed delete into an error the
 * admin would retry.
 */

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockRemove = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: { from: vi.fn(() => ({ remove: mockRemove })) },
  })),
}));

const fetchMock: FetchMock = vi.fn();

function respondWith(...responses: Response[]): void {
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
}

/** A HEAD count response — what `select(..., { count, head: true })` reads. */
function countResponse(total: number): Response {
  return new Response(null, {
    status: 200,
    headers: { "content-range": `*/${total}` },
  });
}

const ID = "6d2b6a5b-6f6d-4a4a-9a56-2b0f1a4c9c11";
const PATH = "c0ffee.png";

const ENTRY = {
  id: ID,
  label: "Minecraft castle",
  sha256: "c0ffee",
  path: PATH,
  created_at: "2026-08-01T00:00:00.000Z",
};

function mockAdmin(): void {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: createFetchStubbedClient(fetchMock),
  });
}

function renameRequest(
  id: string,
  body: unknown,
): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/admin/product-images/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ];
}

function deleteRequest(
  id: string,
): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/admin/product-images/${id}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ id }) },
  ];
}

describe("PATCH /api/admin/product-images/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const response = await PATCH(...renameRequest(ID, { label: "New name" }));
    expect(response.status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Only admins can manage product images" },
        { status: 403 },
      ),
    );
    const response = await PATCH(...renameRequest(ID, { label: "New name" }));
    expect(response.status).toBe(403);
  });

  it("returns 400 for an empty label", async () => {
    mockAdmin();
    const response = await PATCH(...renameRequest(ID, { label: "   " }));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a label past the column's length", async () => {
    mockAdmin();
    const response = await PATCH(
      ...renameRequest(ID, { label: "x".repeat(121) }),
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the entry has already been removed", async () => {
    mockAdmin();
    respondWith(postgrestJson([]));
    const response = await PATCH(...renameRequest(ID, { label: "New name" }));
    expect(response.status).toBe(404);
  });

  it("renames the entry and returns it", async () => {
    mockAdmin();
    respondWith(postgrestJson([{ ...ENTRY, label: "Castle at dusk" }]));

    const response = await PATCH(
      ...renameRequest(ID, { label: "  Castle at dusk  " }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      image: { ...ENTRY, label: "Castle at dusk" },
    });
    // Trimmed by the contract schema before it reaches the database.
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      label: "Castle at dusk",
    });
  });
});

describe("DELETE /api/admin/product-images/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRemove.mockResolvedValue({ error: null });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const response = await DELETE(...deleteRequest(ID));
    expect(response.status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Only admins can manage product images" },
        { status: 403 },
      ),
    );
    const response = await DELETE(...deleteRequest(ID));
    expect(response.status).toBe(403);
  });

  it("returns 404 when the entry has already been removed", async () => {
    mockAdmin();
    respondWith(postgrestJson([]));

    const response = await DELETE(...deleteRequest(ID));

    expect(response.status).toBe(404);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("reports how many products lost their picture, and removes the object", async () => {
    mockAdmin();
    respondWith(
      postgrestJson([{ path: PATH }]),
      countResponse(22),
      postgrestJson([]),
      // The re-check before the bucket is touched: no row names this path.
      postgrestJson([]),
    );

    const response = await DELETE(...deleteRequest(ID));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ unlinked: 22 });

    // Counted before the delete: the foreign key nulls those links, so after
    // it there is nothing left to count.
    const count = fetchMock.mock.calls[1];
    expect(count[1]?.method).toBe("HEAD");
    expect(requestedUrl(count[0]).searchParams.get("image_id")).toBe(`eq.${ID}`);
    expect(fetchMock.mock.calls[2][1]?.method).toBe("DELETE");
    expect(mockRemove).toHaveBeenCalledWith([PATH]);
  });

  it("still succeeds when the object removal fails after the row is gone", async () => {
    mockAdmin();
    mockRemove.mockResolvedValue({ error: { message: "storage unavailable" } });
    respondWith(
      postgrestJson([{ path: PATH }]),
      countResponse(0),
      postgrestJson([]),
      postgrestJson([]),
    );

    const response = await DELETE(...deleteRequest(ID));

    // The row is already deleted; failing the request would invite a retry
    // that has nothing left to delete. The leftover object is logged, and the
    // next upload of those same bytes adopts it — its name IS their hash.
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ unlinked: 0 });
  });

  it("keeps the object when a concurrent upload has re-created a row on that path", async () => {
    mockAdmin();
    respondWith(
      postgrestJson([{ path: PATH }]),
      countResponse(3),
      postgrestJson([]),
      // Between the row delete and the removal, another admin uploaded the
      // same picture: the key is the hash of the bytes, so their new entry
      // names this very object. Removing it would break *their* entry.
      postgrestJson([{ id: "0f0d3a3c-6a26-4a1e-9f0e-3a2c9b7d5e41" }]),
    );

    const response = await DELETE(...deleteRequest(ID));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ unlinked: 3 });
    expect(mockRemove).not.toHaveBeenCalled();
    // The re-check asks the table for that exact path, after the delete.
    const recheck = fetchMock.mock.calls[3];
    expect(requestedUrl(recheck[0]).searchParams.get("path")).toBe(`eq.${PATH}`);
  });

  it("keeps the object when the re-check itself fails", async () => {
    mockAdmin();
    respondWith(
      postgrestJson([{ path: PATH }]),
      countResponse(0),
      postgrestJson([]),
      postgrestJson(
        { message: "connection lost", code: "08006", details: null, hint: null },
        500,
      ),
    );

    const response = await DELETE(...deleteRequest(ID));

    // Unproven is treated as claimed: a surviving object costs bytes, a
    // wrongly removed one costs somebody's picture.
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ unlinked: 0 });
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
