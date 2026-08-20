// @vitest-environment node
//
// Node environment so Request, FormData and File are all undici/Node natives
// from one realm: jsdom's FormData isn't serializable by undici's Request, and
// a file parsed out of a real multipart body would fail the route's
// `instanceof File` check against jsdom's File.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { POST } from "@/app/api/admin/product-images/route";
import {
  createFetchStubbedClient,
  postgrestJson,
  requestedUrl,
  type FetchMock,
} from "../../mocks/postgrest-fetch";

/**
 * POST /api/admin/product-images — the catalogue's upload.
 *
 * The route's whole job is find-or-create by content hash, so these tests are
 * mostly about the four ways "we already have these bytes" can be discovered:
 * a row found up front, storage refusing a duplicate object, a unique
 * violation on the insert, and the ordinary first-time path where none of them
 * fire. Three of the four are success, which is the point.
 *
 * The Supabase side is a REAL typed client with a stubbed fetch (see
 * tests/mocks/postgrest-fetch.ts), so the genuine query builder runs and the
 * assertions are about the requests the route actually issues.
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

/** Canned PostgREST responses, consumed in the order the route issues them. */
function respondWith(...responses: Response[]): void {
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
}

/** A PostgREST error carrying a specific SQLSTATE. */
function postgrestCode(code: string, message: string, status: number): Response {
  return postgrestJson({ message, code, details: null, hint: null }, status);
}

const FILE_BYTES = "the-picture-bytes";
const SHA = createHash("sha256").update(FILE_BYTES).digest("hex");

const ENTRY = {
  id: "6d2b6a5b-6f6d-4a4a-9a56-2b0f1a4c9c11",
  label: "Minecraft castle",
  sha256: SHA,
  path: `${SHA}.png`,
  created_at: "2026-08-01T00:00:00.000Z",
};

function mockAdmin(): void {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: createFetchStubbedClient(fetchMock),
  });
}

function mockUnauthenticated(): void {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function mockForbidden(): void {
  mockRequireRole.mockResolvedValue(
    NextResponse.json(
      { error: "Only admins can manage product images" },
      { status: 403 },
    ),
  );
}

function createRequest(
  options: { file?: File | null; label?: string } = {},
): Request {
  const form = new FormData();
  const file =
    "file" in options
      ? options.file
      : new File([FILE_BYTES], "castle.png", { type: "image/png" });
  if (file) form.append("file", file);
  if (options.label !== undefined) form.append("label", options.label);
  return new Request("http://localhost/api/admin/product-images", {
    method: "POST",
    body: form,
  });
}

/** The JSON body of the nth fetch the route issued. */
function requestBody(call: number): unknown {
  const init = fetchMock.mock.calls[call][1];
  return JSON.parse(String(init?.body));
}

describe("POST /api/admin/product-images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue({ error: null });
  });

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();
    expect((await POST(createRequest())).status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    mockForbidden();
    expect((await POST(createRequest())).status).toBe(403);
  });

  it("returns 400 when no file field is present", async () => {
    mockAdmin();
    const response = await POST(createRequest({ file: null }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/file/i);
  });

  it("returns 413 for a file over the 4 MB cap", async () => {
    mockAdmin();
    const tooBig = new File(
      [new Uint8Array(4 * 1024 * 1024 + 1)],
      "huge.png",
      { type: "image/png" },
    );
    const response = await POST(createRequest({ file: tooBig }));
    expect(response.status).toBe(413);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("returns 415 for a type outside the accept list", async () => {
    mockAdmin();
    const gif = new File([FILE_BYTES], "nope.gif", { type: "image/gif" });
    const response = await POST(createRequest({ file: gif }));
    expect(response.status).toBe(415);
    expect((await response.json()).error).toMatch(/JPEG|PNG|WEBP|AVIF|SVG/);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("returns 415 for an extension that only exists on Object.prototype", async () => {
    // The accept list used to be an object literal, which answers `constructor`
    // and `__proto__` from its prototype chain — so these two names passed the
    // gate and reached storage with a function where the content type belongs.
    // The list is a Map now, and these are simply not in it.
    for (const name of ["castle.constructor", "castle.__proto__", "castle.toString"]) {
      vi.clearAllMocks();
      mockAdmin();
      const response = await POST(
        createRequest({ file: new File([FILE_BYTES], name) }),
      );
      expect(response.status, name).toBe(415);
      expect(mockUpload).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("adds an entry named by the content hash when the bytes are new", async () => {
    mockAdmin();
    respondWith(postgrestJson([]), postgrestJson(ENTRY));

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "added", image: ENTRY });

    // The object is named by the hash of the bytes, never overwritten, and
    // cached for a year — the three properties that make a bucket URL's bytes
    // immutable by construction.
    expect(mockUpload).toHaveBeenCalledWith(
      `${SHA}.png`,
      expect.any(File),
      expect.objectContaining({
        contentType: "image/png",
        upsert: false,
        cacheControl: "31536000",
      }),
    );
    expect(requestedUrl(fetchMock.mock.calls[0][0]).searchParams.get("sha256")).toBe(
      `eq.${SHA}`,
    );
    expect(requestBody(1)).toMatchObject({ sha256: SHA, path: `${SHA}.png` });
  });

  it("answers 'existing' without touching storage when the hash is already known", async () => {
    mockAdmin();
    respondWith(postgrestJson([ENTRY]));

    const response = await POST(createRequest());

    expect(await response.json()).toEqual({ status: "existing", image: ENTRY });
    expect(mockUpload).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a duplicate object in storage as success", async () => {
    mockAdmin();
    // The row is gone but its object survived — a failed removal, or a race.
    // The bytes at that key ARE these bytes, so the upload has nothing to do.
    mockUpload.mockResolvedValue({
      error: { message: "The resource already exists", statusCode: "409" },
    });
    respondWith(postgrestJson([]), postgrestJson(ENTRY));

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "added", image: ENTRY });
  });

  it("re-selects by hash and answers 'existing' when the insert loses a race", async () => {
    mockAdmin();
    respondWith(
      postgrestJson([]),
      postgrestCode("23505", "duplicate key value violates unique constraint", 409),
      postgrestJson([ENTRY]),
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "existing", image: ENTRY });
  });

  it("names a new entry with the supplied label", async () => {
    mockAdmin();
    respondWith(postgrestJson([]), postgrestJson(ENTRY));

    await POST(createRequest({ label: "  Castle at dusk  " }));

    expect(requestBody(1)).toMatchObject({ label: "Castle at dusk" });
  });

  it("falls back to the filename stem, then to a plain name", async () => {
    mockAdmin();
    respondWith(postgrestJson([]), postgrestJson(ENTRY));
    await POST(createRequest({ label: "   " }));
    expect(requestBody(1)).toMatchObject({ label: "castle" });

    vi.clearAllMocks();
    mockUpload.mockResolvedValue({ error: null });
    mockAdmin();
    respondWith(postgrestJson([]), postgrestJson(ENTRY));
    await POST(
      createRequest({
        file: new File([FILE_BYTES], ".png", { type: "image/png" }),
      }),
    );
    expect(requestBody(1)).toMatchObject({ label: "Image" });
  });
});
