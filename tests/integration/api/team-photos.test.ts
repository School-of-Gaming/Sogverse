// @vitest-environment node
//
// Node environment: the route hands a storage Blob straight to a Response, and
// jsdom's Blob is not the undici Response's Blob.

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * GET /api/team/photos/[userId] — a public team profile's photo, for anyone.
 *
 * A deliberately public route, so there is no wrong-role case: there is no
 * role. What this file holds still is what makes it safe to leave open and to
 * cache publicly:
 *
 * - **It reads no session.** The storage client is built with the anon key and
 *   no cookies, so the team-photos read policy answers as anon — "the current
 *   photo of a public profile" — and the answer cannot vary by caller. The
 *   cookie-reading client and the role gate are never touched.
 * - **Anything that is not a public photo is one 404**, whether the folder
 *   shows nothing (hidden, not yet public, not staff, no one) or the object
 *   vanishes between the listing and the download.
 * - **The cache header is pinned**: a year, immutable, for an address that
 *   names a version of the photo, which is every address the app renders; five
 *   minutes, public, no stale serving, for one that names none, which must not
 *   pin today's photo for a year.
 * - **Only a JPEG or a WebP is served, sandboxed.** The route is outside the
 *   proxy and so outside the app's CSP; a stored SVG echoed as one would run
 *   script from our origin.
 *
 * The policy itself is proved against a real database in
 * tests/db/team-profiles-public.test.ts.
 */

const USER_ID = "00000000-0000-0000-0000-000000000003";
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);

const mockList = vi.fn();
const mockDownload = vi.fn();
const mockStorageFrom = vi.fn();
const mockCreateClient = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    mockCreateClient(...args);
    return {
      storage: {
        from: (bucket: string) => {
          mockStorageFrom(bucket);
          return {
            list: (folder: string) => mockList(folder),
            download: (path: string) => mockDownload(path),
          };
        },
      },
    };
  },
}));

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockCreateServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => mockCreateServerClient(...args),
}));

import { GET } from "@/app/api/team/photos/[userId]/route";

function photoRequest(
  userId: string,
  query = "?v=0123456789abcdef",
): [Request, { params: Promise<unknown> }] {
  return [
    new Request(`http://localhost:3000/api/team/photos/${userId}${query}`),
    { params: Promise.resolve({ userId }) },
  ];
}

describe("GET /api/team/photos/[userId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({
      data: [{ id: "object-id", name: "4b1f.jpg" }],
      error: null,
    });
    mockDownload.mockResolvedValue({
      data: new Blob([JPEG_BYTES], { type: "image/jpeg" }),
      error: null,
    });
  });

  // -- Public posture --

  it("serves the public photo with no session and never consults the role gate", async () => {
    const response = await GET(...photoRequest(USER_ID));

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG_BYTES);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(mockRequireRole).not.toHaveBeenCalled();
  });

  it("reads as anon, never with a cookie-reading client, so the answer cannot vary by caller", async () => {
    await GET(...photoRequest(USER_ID));

    expect(mockCreateServerClient).not.toHaveBeenCalled();
    expect(mockCreateClient).toHaveBeenCalledWith(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      expect.objectContaining({ auth: { persistSession: false } }),
    );
  });

  it("downloads the one object the policy shows in the person's folder", async () => {
    await GET(...photoRequest(USER_ID));

    expect(mockStorageFrom).toHaveBeenCalledWith("team-photos");
    expect(mockList).toHaveBeenCalledWith(USER_ID);
    expect(mockDownload).toHaveBeenCalledWith(`${USER_ID}/4b1f.jpg`);
  });

  it("serves a WebP as a WebP, by name when storage names no type", async () => {
    mockList.mockResolvedValue({
      data: [{ id: "object-id", name: "4b1f.webp" }],
      error: null,
    });
    mockDownload.mockResolvedValue({ data: new Blob([JPEG_BYTES]), error: null });

    const response = await GET(...photoRequest(USER_ID));

    expect(response.headers.get("Content-Type")).toBe("image/webp");
  });

  it("never echoes a stored type that is not a JPEG or a WebP", async () => {
    mockDownload.mockResolvedValue({
      data: new Blob([JPEG_BYTES], { type: "image/svg+xml" }),
      error: null,
    });

    const response = await GET(...photoRequest(USER_ID));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("answers 404 for a stored SVG its name does not vouch for", async () => {
    mockList.mockResolvedValue({
      data: [{ id: "object-id", name: "4b1f.svg" }],
      error: null,
    });
    mockDownload.mockResolvedValue({
      data: new Blob(["<svg/>"], { type: "image/svg+xml" }),
      error: null,
    });

    const response = await GET(...photoRequest(USER_ID));

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).not.toBe("image/svg+xml");
  });

  it("sandboxes the photo so nothing in it can run", async () => {
    const response = await GET(...photoRequest(USER_ID));

    expect(response.headers.get("Content-Security-Policy")).toBe(
      "default-src 'none'; sandbox",
    );
  });

  it("serves the current photo whatever version the address carries", async () => {
    const response = await GET(...photoRequest(USER_ID, ""));

    expect(response.status).toBe(200);
  });

  // -- The cache --

  it("caches a versioned address publicly for a year, immutable", async () => {
    const response = await GET(...photoRequest(USER_ID));

    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it.each(["", "?v="])(
    "caches an address naming no version (%j) for five minutes, with no stale serving",
    async (query) => {
      const response = await GET(...photoRequest(USER_ID, query));

      expect(response.headers.get("Cache-Control")).toBe(
        "public, max-age=300, s-maxage=300",
      );
      expect(response.headers.get("Set-Cookie")).toBeNull();
    },
  );

  // -- One 404 for everything that is not a public photo --

  it("answers 404 when the policy shows no photo in the folder", async () => {
    mockList.mockResolvedValue({ data: [], error: null });

    const response = await GET(...photoRequest(USER_ID));

    expect(response.status).toBe(404);
    expect(mockDownload).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBeNull();
  });

  it("answers 404 when the listing fails", async () => {
    mockList.mockResolvedValue({ data: null, error: new Error("boom") });

    const response = await GET(...photoRequest(USER_ID));

    expect(response.status).toBe(404);
  });

  it("ignores a folder entry, which is no object", async () => {
    mockList.mockResolvedValue({
      data: [{ id: null, name: "nested" }],
      error: null,
    });

    const response = await GET(...photoRequest(USER_ID));

    expect(response.status).toBe(404);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("answers 404 when the photo goes between the listing and the download", async () => {
    mockDownload.mockResolvedValue({ data: null, error: new Error("Object not found") });

    const response = await GET(...photoRequest(USER_ID));

    expect(response.status).toBe(404);
  });

  it("refuses an id that is not an id without touching storage", async () => {
    const response = await GET(...photoRequest("not-a-uuid"));

    expect(response.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });
});
