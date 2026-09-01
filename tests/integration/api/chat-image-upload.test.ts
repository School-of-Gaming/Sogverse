// @vitest-environment node
//
// Node environment so Request, FormData and File are all undici/Node natives
// from one realm: jsdom's FormData is not serializable by undici's Request, and
// a file parsed back out of a real multipart body would fail the route's
// `instanceof File` check against jsdom's File. It is also what lets `sharp`
// run for real — this route's re-encode is the thing under test, so it is
// deliberately not mocked.

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { POST } from "@/app/api/chat/images/route";
import { CHAT_IMAGE_MAX_BYTES } from "@/lib/constants/chat";
import { CHAT_LOCKED_SQLSTATE } from "@/services/chat/chat.contracts";
import {
  carriesExif,
  containsText,
  exifBearingJpeg,
  EXIF_FIXTURE_COPYRIGHT,
  EXIF_FIXTURE_ENCODED_HEIGHT,
  EXIF_FIXTURE_ENCODED_WIDTH,
  EXIF_FIXTURE_GPS_DATE_STAMP,
  plainJpeg,
} from "../../mocks/exif-jpeg";

/**
 * POST /api/chat/images — sending one picture into a chat channel.
 *
 * Three properties are what this file exists to hold still.
 *
 * **The strip is a mechanism.** Chat's uploader is any child or parent, not an
 * assigned member of staff, so "a picture of a child never leaves here carrying
 * coordinates" cannot rest on a browser pass a modified client can simply skip.
 * The GPS case below posts a fixture that names where it was taken and asserts
 * the bytes that reach storage do not.
 *
 * **The dimensions are measured, never claimed.** There is no form field for a
 * client to put them in, and the fixture's orientation tag is what proves the
 * measurement is of the *oriented* pixels: it goes in 40 x 10 and has to reach
 * the RPC as 10 x 40.
 *
 * **The RPC is the authorization and the route's gate is only a session.** Every
 * refusal case asserts nothing reached storage, because a refusal that still
 * wrote an object is the failure the private bucket exists to prevent.
 */

// --- Mocks -----------------------------------------------------------------

const mockGetClaims = vi.fn();
const mockRpc = vi.fn();
/** The policy-scoped channel read the route puts in front of the re-encode. */
const mockChannelRead = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getClaims: () => mockGetClaims() },
      rpc: (...args: unknown[]) => mockRpc(...args),
      from: (table: string) => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => mockChannelRead(table) }),
        }),
      }),
    }),
}));

const mockUpload = vi.fn();
const mockRemove = vi.fn();
/** Spied so a case can assert the admin client never touched a table. */
const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mockAdminFrom,
    storage: { from: () => ({ upload: mockUpload, remove: mockRemove }) },
  }),
}));

// --- Fixtures --------------------------------------------------------------

const CHANNEL_ID = "6b1f0f4c-2d9e-4a71-8c53-91d0a7b4e2f8";
const MESSAGE_ID = "c47d3a10-5e88-4b2f-9d61-0a3f7c5b8e12";
const REPLY_TO_ID = "1e5c9b74-3a20-4d6e-8f11-72c4d9a0b563";
const CREATED_AT = "2026-09-01T17:22:31.412Z";

/** A JPEG with GPS, a copyright and an orientation tag. Built once. */
let exifJpeg: Buffer;
/** A JPEG with nothing in it but pixels. */
let cleanJpeg: Buffer;

beforeAll(async () => {
  exifJpeg = await exifBearingJpeg();
  cleanJpeg = await plainJpeg();
});

/** What an iPhone Files-app pick looks like: an ISO-BMFF `ftypheic` box. */
const HEIC_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
]);

function createRequest(
  options: {
    file?: File | null;
    id?: string;
    channelId?: string;
    replyToMessageId?: string;
  } = {},
): Request {
  const form = new FormData();
  const file =
    "file" in options
      ? options.file
      : new File([new Uint8Array(cleanJpeg)], "chat-image.jpg", {
          type: "image/jpeg",
        });
  if (file) form.append("file", file);
  form.append("id", options.id ?? MESSAGE_ID);
  form.append("channelId", options.channelId ?? CHANNEL_ID);
  if (options.replyToMessageId !== undefined) {
    form.append("replyToMessageId", options.replyToMessageId);
  }
  return new Request("http://localhost:3000/api/chat/images", {
    method: "POST",
    body: form,
  });
}

function mockAuthenticated(userId = "member-user-id"): void {
  mockGetClaims.mockResolvedValue({
    data: { claims: { sub: userId, email: "member@example.com" } },
    error: null,
  });
}

function mockUnauthenticated(): void {
  mockGetClaims.mockResolvedValue({ data: null, error: null });
}

/** The bytes the route handed to storage. */
function uploadedBytes(): Buffer {
  const body: unknown = mockUpload.mock.calls[0][1];
  // Narrowed rather than asserted: the whole point of the cases that call this
  // is what is inside those bytes, so "the route stored something that is not a
  // buffer" has to fail loudly here rather than further down as a confusing
  // assertion about metadata.
  if (!Buffer.isBuffer(body)) {
    throw new Error("the route stored something that was not a buffer");
  }
  return body;
}

describe("POST /api/chat/images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticated();
    mockChannelRead.mockResolvedValue({
      data: { id: CHANNEL_ID },
      error: null,
    });
    mockRpc.mockResolvedValue({ data: CREATED_AT, error: null });
    mockUpload.mockResolvedValue({ error: null });
    mockRemove.mockResolvedValue({ error: null });
  });

  // --- Auth ----------------------------------------------------------------

  it("returns 401 when there is no session", async () => {
    mockUnauthenticated();

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses a caller the send RPC does not admit to the channel", async () => {
    // The posture is "any authenticated caller"; membership is the RPC's
    // question, and this is what that answer looks like from out here.
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Forbidden" },
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses a channel the caller's own policies do not admit, before decoding", async () => {
    // The cost gate, and it is a cost gate rather than a second boundary: the
    // re-encode is the expensive step and nothing should spend it for somebody
    // who is not in the channel. RLS answers with no row — a non-member, or a
    // family member past their channel's read window — and the route stops
    // there, so an unbounded decode is never reachable pre-authorization.
    mockChannelRead.mockResolvedValue({ data: null, error: null });

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("reads that channel on the caller's own client, never the admin one", async () => {
    await POST(createRequest());

    expect(mockChannelRead).toHaveBeenCalledWith("chat_channels");
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("answers a lock with the code the client drops its echo on", async () => {
    // The one refusal the client treats differently: a send refused by a lock
    // must offer no retry, because the lock's own realtime arrival is what
    // disables the composer and the refusal merely raced it.
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: CHAT_LOCKED_SQLSTATE,
        message: "You cannot send messages in this chat",
      },
    });

    const response = await POST(createRequest());
    const body: unknown = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({ code: CHAT_LOCKED_SQLSTATE });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  // --- Verification: nothing non-conforming reaches the bucket -------------

  it("refuses a form with no file", async () => {
    const response = await POST(createRequest({ file: null }));

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses an upload over the byte cap, before reading its bytes", async () => {
    const tooBig = new File(
      [new Uint8Array(CHAT_IMAGE_MAX_BYTES + 1)],
      "huge.jpg",
      { type: "image/jpeg" },
    );

    const response = await POST(createRequest({ file: tooBig }));

    expect(response.status).toBe(413);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses raw HEIC by its magic bytes, whatever the form claims", async () => {
    // The content type is a lie on purpose: the declared type is the client's
    // claim about its own file and is not consulted. The sniff also runs before
    // the re-encode, which would happily have decoded a PNG or a WebP — one
    // format in the bucket is a property kept deliberately.
    const heic = new File([HEIC_BYTES], "IMG_0042.heic", {
      type: "image/jpeg",
    });

    const response = await POST(createRequest({ file: heic }));

    expect(response.status).toBe(415);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses bytes that claim to be a JPEG and will not decode", async () => {
    const truncated = new File(
      [new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00])],
      "broken.jpg",
      { type: "image/jpeg" },
    );

    const response = await POST(createRequest({ file: truncated }));

    expect(response.status).toBe(415);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses a message id that is not a uuid", async () => {
    const response = await POST(createRequest({ id: "not-a-uuid" }));

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("refuses a channel id that is not a uuid", async () => {
    const response = await POST(createRequest({ channelId: "nope" }));

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // --- The happy path: row, then object ------------------------------------

  it("writes the row on the caller's client and then stores the object", async () => {
    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: MESSAGE_ID,
      createdAt: CREATED_AT,
      width: 24,
      height: 16,
    });

    // The dimensions are the re-encode's, and the reply parameter travels even
    // when it is absent — a burst with no text puts the reply on the first
    // picture, so this is not a symmetric extra.
    expect(mockRpc).toHaveBeenCalledWith("send_chat_image_message", {
      p_id: MESSAGE_ID,
      p_channel_id: CHANNEL_ID,
      p_width: 24,
      p_height: 16,
      p_reply_to_message_id: undefined,
    });

    // Named by the message row's id with no extension — the object IS the row,
    // which is what the bucket's one policy joins on — one format, never
    // overwritten.
    expect(mockUpload).toHaveBeenCalledWith(
      MESSAGE_ID,
      expect.anything(),
      expect.objectContaining({
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: "31536000",
      }),
    );

    // The sweep belongs to the failure path alone.
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("carries a reply target through to the send", async () => {
    await POST(createRequest({ replyToMessageId: REPLY_TO_ID }));

    expect(mockRpc).toHaveBeenCalledWith(
      "send_chat_image_message",
      expect.objectContaining({ p_reply_to_message_id: REPLY_TO_ID }),
    );
  });

  // --- The strip, and the measurement -------------------------------------

  it("strips EXIF and GPS from the bytes it stores", async () => {
    const gps = new File([new Uint8Array(exifJpeg)], "IMG_0042.jpg", {
      type: "image/jpeg",
    });

    // The fixture really does carry what it claims to — a test that asserted
    // the absence of something that was never there would pass forever.
    expect(carriesExif(exifJpeg)).toBe(true);
    expect(containsText(exifJpeg, EXIF_FIXTURE_GPS_DATE_STAMP)).toBe(true);
    expect(containsText(exifJpeg, EXIF_FIXTURE_COPYRIGHT)).toBe(true);

    const response = await POST(createRequest({ file: gps }));
    expect(response.status).toBe(200);

    const stored = uploadedBytes();
    expect(carriesExif(stored)).toBe(false);
    expect(containsText(stored, EXIF_FIXTURE_GPS_DATE_STAMP)).toBe(false);
    expect(containsText(stored, EXIF_FIXTURE_COPYRIGHT)).toBe(false);
  });

  it("stores the dimensions of the oriented pixels", async () => {
    // The fixture is encoded 40 x 10 with an orientation tag that rotates it,
    // so the true picture is 10 x 40. A route that trusted the file's own
    // header — or a client's claim, for which there is no field at all — would
    // store it the other way round and every viewer's log would draw a
    // landscape box around a portrait picture.
    const gps = new File([new Uint8Array(exifJpeg)], "IMG_0042.jpg", {
      type: "image/jpeg",
    });

    const response = await POST(createRequest({ file: gps }));

    expect(await response.json()).toMatchObject({
      width: EXIF_FIXTURE_ENCODED_HEIGHT,
      height: EXIF_FIXTURE_ENCODED_WIDTH,
    });
    expect(mockRpc).toHaveBeenCalledWith(
      "send_chat_image_message",
      expect.objectContaining({
        p_width: EXIF_FIXTURE_ENCODED_HEIGHT,
        p_height: EXIF_FIXTURE_ENCODED_WIDTH,
      }),
    );
  });

  // --- Compensation --------------------------------------------------------

  it("sweeps the object and tombstones the row when storage refuses", async () => {
    mockUpload.mockResolvedValue({ error: { message: "storage exploded" } });
    mockRpc
      .mockResolvedValueOnce({ data: CREATED_AT, error: null })
      .mockResolvedValueOnce({ data: CREATED_AT, error: null });

    const response = await POST(createRequest());

    // The object is swept even though the upload reported failure: a timeout on
    // the tail of a PUT whose bytes already landed leaves one behind that no
    // row names.
    expect(mockRemove).toHaveBeenCalledWith([MESSAGE_ID]);
    // A HIDE rather than a delete, and deliberately: the INSERT has already
    // reached every subscriber over realtime, messages are never physically
    // deleted, and there is no DELETE for a subscriber to receive — so a hard
    // delete would leave every other client drawing a picture that will never
    // arrive.
    expect(mockRpc).toHaveBeenLastCalledWith("hide_chat_message", {
      p_id: MESSAGE_ID,
    });
    expect(response.status).toBe(500);
  });

  it("stops after a failed compensation rather than building machinery for it", async () => {
    mockUpload.mockResolvedValue({ error: { message: "storage exploded" } });
    mockRpc
      .mockResolvedValueOnce({ data: CREATED_AT, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "XX000", message: "the hide failed too" },
      });

    const response = await POST(createRequest());

    // The row survives naming an object that does not exist, which draws as the
    // empty image box every viewer's renderer already handles; a moderator's
    // remove control is the repair.
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(500);
  });

  it("never reaches a table with the service-role client", async () => {
    await POST(createRequest());

    // The admin client is here for the private bucket's write and nothing else;
    // who may send into a channel is decided entirely by the guard on the user
    // client.
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });
});
