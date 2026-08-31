import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { DELETE } from "@/app/api/gedu/sessions/images/[id]/route";

/**
 * DELETE /api/gedu/sessions/images/[id] — removing a photo from a report.
 *
 * Removal is the feature's kill switch: deleting the object is what makes an
 * already-emailed URL stop resolving, and there is no revocation short of it. So
 * the two things asserted hardest here are that the object really is deleted,
 * and that it is deleted through the **Storage API** — a SQL delete of
 * `storage.objects` orphans the backing file, which is why the admin client's
 * table access is asserted to be untouched.
 *
 * The other half is the refusal. The RPC takes a photo id and nothing else, so a
 * photo in somebody else's group and a photo that does not exist come back
 * identically; this route must not soften that by looking the row up first to
 * say which it was.
 */

// --- Mocks -----------------------------------------------------------------

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockRemove = vi.fn();
/** Spied so the never-SQL claim can be asserted rather than assumed. */
const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mockAdminFrom,
    storage: { from: () => ({ remove: mockRemove }) },
  }),
}));

const mockRpc = vi.fn();

// --- Fixtures --------------------------------------------------------------

const IMAGE_ID = "7c9f2a41-3b8d-4e52-9a17-5d2c6b0e8f43";

function createRequest(): Request {
  return new Request(
    `http://localhost:3000/api/gedu/sessions/images/${IMAGE_ID}`,
    { method: "DELETE" },
  );
}

function context(id: string = IMAGE_ID) {
  return { params: Promise.resolve({ id }) };
}

function mockGedu(): void {
  mockRequireRole.mockResolvedValue({
    user: { id: "gedu-user-id" },
    profile: { id: "gedu-user-id", role: "gedu", first_name: "Marianne" },
    supabase: { rpc: mockRpc },
  });
}

describe("DELETE /api/gedu/sessions/images/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockRemove.mockResolvedValue({ error: null });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await DELETE(createRequest(), context());

    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("returns 403 for a role that may not remove photos", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    expect((await DELETE(createRequest(), context())).status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("refuses a path segment that is not a photo id", async () => {
    mockGedu();

    const response = await DELETE(createRequest(), context("not-a-uuid"));

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("deletes the row on the caller's client, then the object", async () => {
    mockGedu();

    const response = await DELETE(createRequest(), context());

    expect(mockRpc).toHaveBeenCalledWith("delete_group_session_image", {
      p_image_id: IMAGE_ID,
    });
    // Through the Storage API, and named by the row's id — the object name is
    // derived, never stored.
    expect(mockRemove).toHaveBeenCalledWith([`${IMAGE_ID}.jpg`]);
    // A SQL delete of storage.objects orphans the backing file, so the admin
    // client must never reach a table here.
    expect(mockAdminFrom).not.toHaveBeenCalled();
    // Nothing to say: the id sent is the id that is gone.
    expect(response.status).toBe(204);
  });

  it("leaves the object alone when the row delete is refused", async () => {
    mockGedu();
    // 42501 covers "not your group" AND "no such photo", deliberately
    // indistinguishable — the route must not tell them apart either.
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Forbidden" },
    });

    const response = await DELETE(createRequest(), context());

    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("notAllowed");
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("still succeeds when the object delete fails", async () => {
    mockGedu();
    mockRemove.mockResolvedValue({ error: { message: "storage exploded" } });

    const response = await DELETE(createRequest(), context());

    // The row is what every surface reads and it is gone: the URL is dead to the
    // app, an already-emailed copy stops loading, and the leftover bytes are
    // recoverable by joining derived names against the bucket's own listing.
    // Retrying here would be machinery for a state that join already covers.
    expect(response.status).toBe(204);
  });
});
