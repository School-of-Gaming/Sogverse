// @vitest-environment node
//
// Node environment for the same reason as the upload test: Request, FormData
// and File must all be undici/Node natives from one realm.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { POST } from "@/app/api/admin/product-images/[id]/replace/route";
import {
  createFetchStubbedClient,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

/**
 * POST /api/admin/product-images/[id]/replace — the repoint.
 *
 * What matters here is that replacing is never an edit of an entry: the new
 * bytes get their own entry (inheriting the replaced entry's name) and every
 * product that used the old one is moved across in a single statement. The
 * cases below are the three shapes that has — nothing to move, something to
 * move, and the entry having vanished under the admin.
 */

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockUpload = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: { from: vi.fn(() => ({ upload: mockUpload })) },
  })),
}));

const fetchMock: FetchMock = vi.fn();

function respondWith(...responses: Response[]): void {
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
}

const OLD_ID = "6d2b6a5b-6f6d-4a4a-9a56-2b0f1a4c9c11";
const NEW_ID = "9f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";

const NEW_BYTES = "the-new-picture-bytes";
const NEW_SHA = createHash("sha256").update(NEW_BYTES).digest("hex");

const OLD_ENTRY = { id: OLD_ID, label: "Minecraft castle" };

const NEW_ENTRY = {
  id: NEW_ID,
  label: "Minecraft castle",
  sha256: NEW_SHA,
  path: `${NEW_SHA}.png`,
  created_at: "2026-08-02T00:00:00.000Z",
};

function mockAdmin(): void {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: createFetchStubbedClient(fetchMock),
  });
}

function createRequest(
  id: string,
  file: File = new File([NEW_BYTES], "castle-v2.png", { type: "image/png" }),
): [Request, { params: Promise<{ id: string }> }] {
  const form = new FormData();
  form.append("file", file);
  return [
    new Request(
      `http://localhost/api/admin/product-images/${id}/replace`,
      { method: "POST", body: form },
    ),
    { params: Promise.resolve({ id }) },
  ];
}

/** The JSON body of the nth fetch the route issued. */
function requestBody(call: number): unknown {
  const init = fetchMock.mock.calls[call][1];
  return JSON.parse(String(init?.body));
}

describe("POST /api/admin/product-images/[id]/replace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue({ error: null });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const response = await POST(...createRequest(OLD_ID));
    expect(response.status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Only admins can manage product images" },
        { status: 403 },
      ),
    );
    const response = await POST(...createRequest(OLD_ID));
    expect(response.status).toBe(403);
  });

  it("returns 415 for a type outside the accept list", async () => {
    mockAdmin();
    const response = await POST(
      ...createRequest(
        OLD_ID,
        new File([NEW_BYTES], "nope.gif", { type: "image/gif" }),
      ),
    );
    expect(response.status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the entry has already been removed", async () => {
    mockAdmin();
    respondWith(postgrestJson([]));

    const response = await POST(...createRequest(OLD_ID));

    expect(response.status).toBe(404);
    // Nothing was uploaded for an entry that no longer exists.
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("relinks nothing when the new bytes are the entry's own bytes", async () => {
    mockAdmin();
    respondWith(
      postgrestJson([OLD_ENTRY]),
      postgrestJson([{ ...NEW_ENTRY, id: OLD_ID }]),
    );

    const response = await POST(...createRequest(OLD_ID));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ relinked: 0 });
    // The lookup and the hash check, and no repoint statement after them.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("repoints every linked product in one statement and reports the count", async () => {
    mockAdmin();
    respondWith(
      postgrestJson([OLD_ENTRY]),
      postgrestJson([]),
      postgrestJson(NEW_ENTRY),
      postgrestJson([{ id: "p1" }, { id: "p2" }, { id: "p3" }]),
    );

    const response = await POST(...createRequest(OLD_ID));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ image: NEW_ENTRY, relinked: 3 });

    const repoint = fetchMock.mock.calls[3];
    expect(repoint[1]?.method).toBe("PATCH");
    // One statement, filtered on the OLD entry — that is what makes every
    // linked product follow atomically.
    expect(requestedUrl(repoint[0]).searchParams.get("image_id")).toBe(
      `eq.${OLD_ID}`,
    );
    expect(requestBody(3)).toEqual({ image_id: NEW_ID });
  });

  it("gives a newly created entry the replaced entry's name", async () => {
    mockAdmin();
    respondWith(
      postgrestJson([OLD_ENTRY]),
      postgrestJson([]),
      postgrestJson(NEW_ENTRY),
      postgrestJson([]),
    );

    await POST(...createRequest(OLD_ID));

    // Not "castle-v2" — a replaced picture keeps the name admins know it by.
    expect(requestBody(2)).toMatchObject({
      label: "Minecraft castle",
      sha256: NEW_SHA,
    });
  });
});
