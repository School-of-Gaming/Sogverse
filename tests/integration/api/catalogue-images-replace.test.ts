// @vitest-environment node
//
// Node environment for the same reason as the upload test: Request, FormData
// and File must all be undici/Node natives from one realm.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { POST } from "@/app/api/admin/catalogue-images/[id]/replace/route";
import {
  createFetchStubbedClient,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";
import { plainJpeg } from "../../mocks/exif-jpeg";

/**
 * POST /api/admin/catalogue-images/[id]/replace — the repoint.
 *
 * What matters here is that replacing is never an edit of an entry: the new
 * bytes get their own entry (inheriting the replaced entry's name) and every
 * product that used the old one is moved across in a single statement, and
 * every Library cover — draft and live — in `repoint_library_covers`. The
 * cases below are the forms that takes — nothing to move, products to move,
 * covers to move, and the entry having vanished under the admin.
 */

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockUpload = vi.fn();
/** Which bucket each upload went to — the replaced entry's purpose's own. */
const mockStorageFrom = vi.fn((_bucket: string) => ({ upload: mockUpload }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    storage: { from: (bucket: string) => mockStorageFrom(bucket) },
  })),
}));

const fetchMock: FetchMock = vi.fn();

function respondWith(...responses: Response[]): void {
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
}

const OLD_ID = "6d2b6a5b-6f6d-4a4a-9a56-2b0f1a4c9c11";
const NEW_ID = "9f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";

/** A real JPEG at exactly a product picture's size: the route measures the bytes. */
const NEW_BYTES = new Uint8Array(await plainJpeg(1200, 800));
const NEW_SHA = createHash("sha256").update(NEW_BYTES).digest("hex");

const OLD_ENTRY = { id: OLD_ID, label: "Minecraft castle", purpose: "product" };

const NEW_ENTRY = {
  id: NEW_ID,
  label: "Minecraft castle",
  sha256: NEW_SHA,
  path: `${NEW_SHA}.jpg`,
  purpose: "product",
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
  file: File = new File([NEW_BYTES], "castle-v2.jpg", { type: "image/jpeg" }),
  purpose?: string,
): [Request, { params: Promise<{ id: string }> }] {
  const form = new FormData();
  form.append("file", file);
  if (purpose !== undefined) form.append("purpose", purpose);
  return [
    new Request(
      `http://localhost/api/admin/catalogue-images/${id}/replace`,
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

describe("POST /api/admin/catalogue-images/[id]/replace", () => {
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
        { error: "Only admins can manage catalogue images" },
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
      // A product picture is no Library cover, so no article moves.
      postgrestJson(0),
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
    // The new bytes went to the product purpose's bucket.
    expect(mockStorageFrom).toHaveBeenCalledWith("product-images");
  });

  it("moves every Library cover using the entry, draft and live, and counts the articles", async () => {
    mockAdmin();
    const wideBytes = new Uint8Array(await plainJpeg(1600, 900));
    const wideSha = createHash("sha256").update(wideBytes).digest("hex");
    const wideEntry = {
      ...NEW_ENTRY,
      sha256: wideSha,
      path: `${wideSha}.jpg`,
      purpose: "library_cover",
    };
    respondWith(
      postgrestJson([{ ...OLD_ENTRY, purpose: "library_cover" }]),
      postgrestJson([]),
      postgrestJson(wideEntry),
      // No product links a cover.
      postgrestJson([]),
      postgrestJson(2),
    );

    const response = await POST(
      ...createRequest(OLD_ID, new File([wideBytes], "cover-v2.jpg")),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ image: wideEntry, relinked: 2 });

    const covers = fetchMock.mock.calls[4];
    expect(requestedUrl(covers[0]).pathname).toBe(
      "/rest/v1/rpc/repoint_library_covers",
    );
    expect(requestBody(4)).toEqual({ p_from: OLD_ID, p_to: NEW_ID });
    // The replacement inherits the cover purpose: looked up and created as a
    // cover, and uploaded to the covers' own bucket.
    expect(
      requestedUrl(fetchMock.mock.calls[1][0]).searchParams.get("purpose"),
    ).toBe("eq.library_cover");
    expect(requestBody(2)).toMatchObject({ purpose: "library_cover" });
    expect(mockStorageFrom).toHaveBeenCalledWith("library-covers");
    expect(mockStorageFrom).not.toHaveBeenCalledWith("product-images");
  });

  it("fails loudly when the covers cannot follow, rather than reporting a partial move", async () => {
    mockAdmin();
    respondWith(
      postgrestJson([OLD_ENTRY]),
      postgrestJson([]),
      postgrestJson(NEW_ENTRY),
      postgrestJson([{ id: "p1" }]),
      postgrestJson(
        { message: "connection lost", code: "08006", details: null, hint: null },
        500,
      ),
    );

    const response = await POST(...createRequest(OLD_ID));

    expect(response.status).toBe(500);
  });

  it("gives a newly created entry the replaced entry's name", async () => {
    mockAdmin();
    respondWith(
      postgrestJson([OLD_ENTRY]),
      postgrestJson([]),
      postgrestJson(NEW_ENTRY),
      postgrestJson([]),
      postgrestJson(0),
    );

    await POST(...createRequest(OLD_ID));

    // Not "castle-v2" — a replaced picture keeps the name admins know it by.
    expect(requestBody(2)).toMatchObject({
      label: "Minecraft castle",
      sha256: NEW_SHA,
      purpose: "product",
    });
  });

  it("measures the new picture against the replaced entry's purpose, not the form's", async () => {
    // Everything that follows the repoint may link only the old entry's
    // purpose, so a replacement keeps it — a `purpose` field saying otherwise
    // changes nothing.
    mockAdmin();
    respondWith(postgrestJson([{ ...OLD_ENTRY, purpose: "library_cover" }]));

    const response = await POST(
      ...createRequest(
        OLD_ID,
        new File([NEW_BYTES], "castle-v2.jpg", { type: "image/jpeg" }),
        "product",
      ),
    );

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("IMAGE_WRONG_SIZE");
    expect(mockUpload).not.toHaveBeenCalled();
    // The entry read, and nothing written after it.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a JPEG that is not exactly the purpose's size", async () => {
    mockAdmin();
    respondWith(postgrestJson([OLD_ENTRY]));

    const legacy = new Uint8Array(await plainJpeg(1200, 750));
    const response = await POST(
      ...createRequest(OLD_ID, new File([legacy], "castle-v2.jpg")),
    );

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe("IMAGE_WRONG_SIZE");
    expect(mockUpload).not.toHaveBeenCalled();
  });
});
