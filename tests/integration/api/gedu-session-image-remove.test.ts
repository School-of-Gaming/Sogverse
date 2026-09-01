import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { DELETE } from "@/app/api/gedu/sessions/images/[id]/route";
import { isSessionPhotoErrorCode } from "@/services/gedu-sessions/gedu-sessions.contracts";

/**
 * DELETE /api/gedu/sessions/images/[id] — removing a photo from a report.
 *
 * Removal is the feature's kill switch: deleting the object is what makes an
 * already-emailed URL stop resolving, and there is no revocation short of it. So
 * the object goes FIRST and the row second, and three properties follow from
 * that order — they are what this file exists to hold still.
 *
 * **Authorization precedes the privileged call.** The storage delete runs on the
 * service-role client against a bucket with no policies at all, so a check-only
 * RPC on the caller's own client has to answer first. Every refusal case below
 * asserts that nothing was removed.
 *
 * **A failed removal is visible and retryable.** If the object cannot be
 * removed, the row is left alone: the photo is still on the card, the answer is
 * an error the gedu can see, and pressing remove again is a real retry. Row
 * first made that outcome unreachable — the tile would be gone with the object
 * still in a public bucket.
 *
 * **Deletion goes through the Storage API, never SQL** — a SQL delete of
 * `storage.objects` orphans the backing file — which is why the admin client's
 * table access is asserted to be untouched.
 *
 * The other half is the refusal itself. The RPCs take a photo id and nothing
 * else, so a photo in somebody else's group and a photo that does not exist come
 * back identically; this route must not soften that by looking the row up first
 * to say which it was.
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

/**
 * The route's answer, as the service reads it: a status and a stable code.
 *
 * Membership of the feature's error vocabulary is asserted here rather than per
 * case — a refusal travels as a code the UI resolves with `t()`, never as a
 * message anything renders.
 */
async function refusal(response: Response) {
  const body: unknown = await response.json();
  const code =
    typeof body === "object" && body !== null && "code" in body
      ? body.code
      : undefined;
  expect(isSessionPhotoErrorCode(code)).toBe(true);
  return { status: response.status, code };
}

/** A refusal from the RPC named first, everything after it succeeding. */
function rpcFails(error: { code: string; message: string }, call: 1 | 2): void {
  if (call === 1) {
    mockRpc.mockResolvedValueOnce({ data: null, error });
    return;
  }
  mockRpc
    .mockResolvedValueOnce({ data: IMAGE_ID, error: null })
    .mockResolvedValueOnce({ data: null, error });
}

describe("DELETE /api/gedu/sessions/images/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: IMAGE_ID, error: null });
    mockRemove.mockResolvedValue({ data: [], error: null });
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

  it("gates on a certified educator, or an admin", async () => {
    mockGedu();

    await DELETE(createRequest(), context());

    // Taking a photo of a child back out of a report is the same trust boundary
    // as mailing the report, so it carries the same gate. The certification test
    // is applied to a `gedu` caller alone, so naming admin here widens who may
    // press remove without relaxing anything for educators.
    expect(mockRequireRole).toHaveBeenCalledWith(
      ["gedu", "admin"],
      expect.objectContaining({ requireCertifiedGedu: true }),
    );
  });

  it("refuses a path segment that is not a photo id", async () => {
    mockGedu();

    const response = await DELETE(createRequest(), context("not-a-uuid"));

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("authorizes on the caller's client, then deletes the object, then the row", async () => {
    mockGedu();

    const response = await DELETE(createRequest(), context());

    // The check comes first because the storage call below is the service
    // role's: the admin client must never act for a caller whose right to this
    // photo has not been established.
    expect(mockRpc).toHaveBeenNthCalledWith(
      1,
      "assert_can_delete_session_image",
      { p_image_id: IMAGE_ID },
    );
    // Through the Storage API, and named by the row's id — the object name is
    // derived, never stored.
    expect(mockRemove).toHaveBeenCalledWith([`${IMAGE_ID}.jpg`]);
    // The row last, on the same client: its own guard runs again on the actual
    // delete, so the check above does not replace it.
    expect(mockRpc).toHaveBeenNthCalledWith(2, "delete_group_session_image", {
      p_image_id: IMAGE_ID,
    });
    // A SQL delete of storage.objects orphans the backing file, so the admin
    // client must never reach a table here.
    expect(mockAdminFrom).not.toHaveBeenCalled();
    // Nothing to say: the id sent is the id that is gone.
    expect(response.status).toBe(204);
  });

  it("removes nothing when the caller is refused the photo", async () => {
    mockGedu();
    // 42501 covers "not your group" AND "no such photo", deliberately
    // indistinguishable — the route must not tell them apart either.
    rpcFails({ code: "42501", message: "Forbidden" }, 1);

    const response = await DELETE(createRequest(), context());

    expect(await refusal(response)).toEqual({
      status: 403,
      code: "notAllowed",
    });
    // The object survives an unauthorized caller, which is the whole reason the
    // check exists in front of it.
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it("answers an unexpected refusal of the check as a removal that did not happen", async () => {
    mockGedu();
    rpcFails({ code: "XX000", message: "the check itself failed" }, 1);

    expect(await refusal(await DELETE(createRequest(), context()))).toEqual({
      status: 500,
      code: "removeFailed",
    });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("reports a failed object delete and leaves the row standing", async () => {
    mockGedu();
    mockRemove.mockResolvedValue({
      data: null,
      error: { message: "storage exploded" },
    });

    const response = await DELETE(createRequest(), context());

    // The owner's requirement, and the whole reason the object goes first: a
    // removal that did not remove the picture is VISIBLE, and the photo is
    // still on the card to try again with.
    expect(await refusal(response)).toEqual({
      status: 502,
      code: "removeFailed",
    });
    // The row is untouched — no delete ran — so the tile stays and the retry has
    // something to act on.
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).not.toHaveBeenCalledWith(
      "delete_group_session_image",
      expect.anything(),
    );
  });

  it("clears the row on a retry whose object is already gone", async () => {
    mockGedu();
    // Verified against the live Storage API (2026-08-31): `remove()` answers
    // `{ data: [], error: null }` for a name that is not in the bucket, so a
    // missing object is a successful delete rather than a 404. That is what
    // makes the surviving-row case above self-repairing instead of permanent.
    mockRemove.mockResolvedValue({ data: [], error: null });

    const response = await DELETE(createRequest(), context());

    expect(response.status).toBe(204);
    expect(mockRpc).toHaveBeenLastCalledWith("delete_group_session_image", {
      p_image_id: IMAGE_ID,
    });
  });

  it("reports a surviving row after the object is gone", async () => {
    mockGedu();
    rpcFails({ code: "XX000", message: "the row delete failed" }, 2);

    const response = await DELETE(createRequest(), context());

    // The picture will not load and the tile remains: a failed removal, answered
    // as one. Its own remove control is the repair, and it works because the
    // object delete of an already-missing file succeeds.
    expect(await refusal(response)).toEqual({
      status: 500,
      code: "removeFailed",
    });
    expect(mockRemove).toHaveBeenCalledWith([`${IMAGE_ID}.jpg`]);
  });

  it("succeeds when a concurrent remove took the row first", async () => {
    mockGedu();
    // The check passed a moment ago, so a 42501 on the row delete means the row
    // is GONE — the delete RPC answers a photo id belonging to nothing exactly
    // as it answers one belonging to another group. Object gone and row gone is
    // the caller's whole intent, whoever performed which half.
    rpcFails({ code: "42501", message: "Forbidden" }, 2);

    const response = await DELETE(createRequest(), context());

    expect(response.status).toBe(204);
  });
});
