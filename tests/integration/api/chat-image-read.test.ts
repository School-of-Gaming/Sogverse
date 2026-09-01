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
 * **The bytes are served privately cacheable, for one hour.** The object never
 * changes, but a browser cache is keyed to the browser profile rather than to
 * the principal — and a family shares one profile across an account switch —
 * so the bound is what stops one principal's fetch being replayed to the next,
 * past a hide and past the family read window. An hour still makes a
 * re-render, a remount or a reload free. The exact header is pinned below,
 * because loosening it back to a year is a one-word edit with a consequence
 * nothing else would catch.
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

  it("answers every refusal and absence with one identical 404, body and all", async () => {
    // A non-member, a family member past their read window, a hidden
    // message's object for a non-moderator, and an object that never landed
    // all arrive here as the policy-scoped download failing — and all must
    // leave as the same response, so the route cannot be used to probe which
    // it was. **The status alone is not enough to hold that still**: a body
    // carrying the storage message would say "Object not found" for one and
    // something permission-shaped for another, and a future
    // `discloseErrorMessages` on this route would turn it into an oracle
    // without moving a status code. So two differently-shaped failures are
    // driven through and compared whole.
    const answers: { status: number; body: unknown }[] = [];
    for (const message of [
      "Object not found",
      `Unauthorized: permission denied for object ${MESSAGE_ID}`,
    ]) {
      mockDownload.mockResolvedValue({ data: null, error: { message } });
      const response = await GET(...createRequest(MESSAGE_ID));
      answers.push({ status: response.status, body: await response.json() });
    }

    // `defineRoute`'s generic message for a 404, pinned literally — the shape
    // a caller gets when a route has NOT opted into disclosure.
    expect(answers[0]).toEqual({ status: 404, body: { error: "Not found" } });
    // And the permission-shaped failure is that same answer, whole.
    expect(answers[1]).toEqual(answers[0]);
  });

  it("serves the bytes the policy admitted, privately cacheable for an hour", async () => {
    const response = await GET(...createRequest(MESSAGE_ID));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    // No `immutable`, and not a year: the cache is keyed to the browser
    // profile a family shares across an account switch, so the entry's life is
    // what bounds serving one principal's picture to the next.
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(JPEG_BYTES);

    // The object's name IS the message id — no extension, no path column —
    // and the ask went to the chat bucket on the caller's own client.
    expect(mockStorageFrom).toHaveBeenCalledWith("chat-images");
    expect(mockDownload).toHaveBeenCalledWith(MESSAGE_ID);
  });
});
