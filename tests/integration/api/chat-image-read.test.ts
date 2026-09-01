// @vitest-environment node
//
// Node environment for the same one-realm reason as the upload test: the
// route hands a storage Blob straight to a Response, and jsdom's Blob is not
// the undici Response's Blob.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/chat/images/[id]/route";

/**
 * GET /api/chat/images/[id] — the bytes of one stored chat image.
 *
 * Two properties are what this file exists to hold still.
 *
 * **The storage policy is the boundary, exercised on the CALLER'S OWN
 * client.** The route holds no logic about membership, time bounds or hidden
 * state — it downloads as the viewer and the bucket's one SELECT policy
 * answers. So the cases here are about the translation, not the policy: the
 * download must run on the user-bound client (never the admin one, which this
 * route does not even import), and whatever the policy refuses must come back
 * as the same 404 an absent object gets, so nothing here is an oracle for
 * message ids or hidden state.
 *
 * **The bytes are served cacheable-per-user, forever.** The object is
 * immutable — `upsert: false` under a primary key that cannot recur — so
 * `private, immutable` at this stable URL is what lets a browser draw a
 * re-render, remount or reload from its own cache instead of re-fetching a
 * child's picture through the fleet.
 */

const mockGetClaims = vi.fn();
const mockDownload = vi.fn();
/** The bucket name the route asked for, captured per call. */
const mockStorageFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getClaims: () => mockGetClaims() },
      storage: {
        from: (bucket: string) => {
          mockStorageFrom(bucket);
          return { download: (path: string) => mockDownload(path) };
        },
      },
    }),
}));

const MESSAGE_ID = "c47d3a10-5e88-4b2f-9d61-0a3f7c5b8e12";
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43]);

function createRequest(id: string): [Request, { params: Promise<unknown> }] {
  return [
    new Request(`http://localhost:3000/api/chat/images/${id}`),
    { params: Promise.resolve({ id }) },
  ];
}

describe("GET /api/chat/images/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "member-user-id", email: "member@example.com" } },
      error: null,
    });
    mockDownload.mockResolvedValue({
      data: new Blob([JPEG_BYTES], { type: "image/jpeg" }),
      error: null,
    });
  });

  it("returns 401 when there is no session, before touching storage", async () => {
    mockGetClaims.mockResolvedValue({ data: null, error: null });

    const response = await GET(...createRequest(MESSAGE_ID));

    expect(response.status).toBe(401);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("refuses an id that is not a uuid, before touching storage", async () => {
    const response = await GET(...createRequest("not-a-uuid"));

    expect(response.status).toBe(400);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("answers every refusal and absence with one identical 404", async () => {
    // A non-member, a family member past their read window, a hidden
    // message's object for a non-moderator, and an object that never landed
    // all arrive here as the policy-scoped download failing — and all leave as
    // the same 404, so the route cannot be used to probe which it was.
    mockDownload.mockResolvedValue({
      data: null,
      error: { message: "Object not found" },
    });

    const response = await GET(...createRequest(MESSAGE_ID));

    expect(response.status).toBe(404);
  });

  it("serves the bytes the policy admitted, immutably cacheable per user", async () => {
    const response = await GET(...createRequest(MESSAGE_ID));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe(
      "private, immutable, max-age=31536000",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG_BYTES);

    // The object's name IS the message id — no extension, no path column —
    // and the ask went to the chat bucket on the caller's own client.
    expect(mockStorageFrom).toHaveBeenCalledWith("chat-images");
    expect(mockDownload).toHaveBeenCalledWith(MESSAGE_ID);
  });
});
