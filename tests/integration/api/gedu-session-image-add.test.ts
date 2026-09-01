// @vitest-environment node
//
// Node environment so Request, FormData and File are all undici/Node natives
// from one realm: jsdom's FormData is not serializable by undici's Request, and
// a file parsed back out of a real multipart body would fail the route's
// `instanceof File` check against jsdom's File.

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextResponse } from "next/server";
import { POST } from "@/app/api/gedu/sessions/images/route";
import {
  isSessionPhotoErrorCode,
  SESSION_PHOTO_CAP,
  SESSION_PHOTO_CAP_REACHED_SQLSTATE,
  SESSION_PHOTO_MAX_BYTES,
} from "@/services/gedu-sessions/gedu-sessions.contracts";
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
 * POST /api/gedu/sessions/images — attaching a photo to a session report.
 *
 * Three properties are what this file exists to hold still.
 *
 * **The bucket's invariant.** This route is the bucket's only writer, so
 * "everything stored is a conforming JPEG under the cap" is true only for as
 * long as the verification here is. Every refusal case below asserts that
 * nothing reached the database *or* storage, because a refusal that still wrote
 * something is the failure the invariant is about.
 *
 * **The EXIF/GPS strip, and with it the measurement.** The route re-encodes
 * every accepted photo through the shared `sharp` pass before storing it, which
 * is what makes the strip a mechanism rather than a browser habit a modified
 * client can skip — the same guarantee the chat upload route carries, proved
 * here with the same fixture. Its second effect is that the stored dimensions
 * are the ones the re-encode measured, so the form's claimed pair is an early
 * plausibility refusal and reaches no column.
 *
 * **The row-then-object order, and its compensation.** The insert runs first, on
 * the caller's own client where the guard is the authorization; the object
 * follows on the admin client; and a failed upload unwinds both halves in
 * reverse — sweeping the object, then deleting the row. That order is the
 * deliberate inverse of the product catalogue's, because here a row whose object
 * never landed is a broken image on the staff card and in every mail sent
 * afterwards, and an object no row names is one nothing will ever delete.
 */

// --- Mocks -----------------------------------------------------------------

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
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

const mockRpc = vi.fn();

// --- Fixtures --------------------------------------------------------------

const GROUP_ID = "0f0b1d7c-6a2e-4f7b-9d3a-6c1f2b8e4a51";
const SESSION_DATE = "2026-08-20";
const IMAGE_ID = "7c9f2a41-3b8d-4e52-9a17-5d2c6b0e8f43";

/** What an iPhone Files-app pick looks like: an ISO-BMFF `ftypheic` box. */
const HEIC_BYTES = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
]);

/**
 * Real JPEGs, built once.
 *
 * They have to be real now: the route decodes and re-encodes what it accepts,
 * so the three-byte stub this file used to post would be refused as a JPEG that
 * will not decode — which is itself one of the cases below.
 */
let cleanJpeg: Buffer;
let exifJpeg: Buffer;

/** The dimensions `cleanJpeg` decodes to, and so what the row must store. */
const CLEAN_WIDTH = 24;
const CLEAN_HEIGHT = 16;

beforeAll(async () => {
  cleanJpeg = await plainJpeg(CLEAN_WIDTH, CLEAN_HEIGHT);
  exifJpeg = await exifBearingJpeg();
});

function jpegFile(): File {
  return new File([new Uint8Array(cleanJpeg)], "session-photo.jpg", {
    type: "image/jpeg",
  });
}

/** The bytes the route handed to storage. */
function uploadedBytes(): Buffer {
  const body: unknown = mockUpload.mock.calls[0][1];
  // Narrowed rather than asserted: the cases that call this are about what is
  // inside those bytes, so "the route stored something that is not a buffer"
  // has to fail loudly here rather than as a puzzling metadata assertion below.
  if (!Buffer.isBuffer(body)) {
    throw new Error("the route stored something that was not a buffer");
  }
  return body;
}

function createRequest(
  options: {
    file?: File | null;
    groupId?: string;
    sessionDate?: string;
    width?: string;
    height?: string;
  } = {},
): Request {
  const form = new FormData();
  const file = "file" in options ? options.file : jpegFile();
  if (file) form.append("file", file);
  form.append("groupId", options.groupId ?? GROUP_ID);
  form.append("sessionDate", options.sessionDate ?? SESSION_DATE);
  form.append("width", options.width ?? "1920");
  form.append("height", options.height ?? "1080");
  return new Request("http://localhost:3000/api/gedu/sessions/images", {
    method: "POST",
    body: form,
  });
}

function mockGedu(): void {
  mockRequireRole.mockResolvedValue({
    user: { id: "gedu-user-id" },
    profile: { id: "gedu-user-id", role: "gedu", first_name: "Marianne" },
    supabase: { rpc: mockRpc },
  });
}

function mockUnauthenticated(): void {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function mockForbidden(): void {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  );
}

/**
 * The route's answer, as the service reads it: a status and a stable code.
 *
 * Membership of the feature's error vocabulary is asserted here rather than per
 * case, because it is the same claim every time — a refusal travels as a code
 * the UI resolves with `t()`, never as a message anything renders.
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

describe("POST /api/gedu/sessions/images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: IMAGE_ID, error: null });
    mockUpload.mockResolvedValue({ error: null });
    mockRemove.mockResolvedValue({ error: null });
  });

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("returns 403 for a role that may not attach photos", async () => {
    mockForbidden();

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("gates on a certified educator, or an admin", async () => {
    mockGedu();
    await POST(createRequest());

    // The roles are the coarse filter; the RPC's assignment guard is the real
    // boundary. Recorded here so widening the gate is a visible change.
    //
    // Putting a picture of a child in front of a family is the same trust
    // boundary as mailing the report it rides in, so this carries that route's
    // certification gate. The gate applies it to a `gedu` caller alone, so
    // naming admin widens who may attach without relaxing anything for
    // educators.
    expect(mockRequireRole).toHaveBeenCalledWith(
      ["gedu", "admin"],
      expect.objectContaining({ requireCertifiedGedu: true }),
    );
  });

  // --- Verification: nothing non-conforming reaches the bucket -------------

  it("refuses a form with no file", async () => {
    mockGedu();

    const response = await POST(createRequest({ file: null }));

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses an upload over the byte cap, before reading its bytes", async () => {
    mockGedu();
    const tooBig = new File(
      [new Uint8Array(SESSION_PHOTO_MAX_BYTES + 1)],
      "huge.jpg",
      { type: "image/jpeg" },
    );

    const response = await POST(createRequest({ file: tooBig }));

    expect(await refusal(response)).toEqual({
      status: 413,
      code: "tooLarge",
    });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses raw HEIC by its magic bytes, whatever the form claims", async () => {
    mockGedu();
    // The mainline iPhone path never lands here — iOS transcodes a
    // photo-library pick to JPEG on the way through the accept list — but a
    // Files-app pick and a macOS drag-drop do, and this refusal is the one whose
    // copy tells the gedu to convert and try again. The content type is a lie on
    // purpose: the declared type is the client's claim and is not consulted.
    const heic = new File([HEIC_BYTES], "IMG_0042.heic", {
      type: "image/jpeg",
    });

    const response = await POST(createRequest({ file: heic }));

    expect(await refusal(response)).toEqual({ status: 415, code: "notJpeg" });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses a dimension past the table's sanity ceiling", async () => {
    mockGedu();

    const response = await POST(createRequest({ width: "9000" }));

    expect(await refusal(response)).toEqual({
      status: 400,
      code: "badDimensions",
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("refuses a dimension that is not a positive number", async () => {
    mockGedu();

    for (const width of ["0", "-4", "not-a-number"]) {
      vi.clearAllMocks();
      mockGedu();
      const response = await POST(createRequest({ width }));
      expect(await refusal(response), width).toEqual({
        status: 400,
        code: "badDimensions",
      });
      expect(mockRpc).not.toHaveBeenCalled();
    }
  });

  // --- The happy path: row, then object ------------------------------------

  it("inserts the row on the caller's client and then stores the object", async () => {
    mockGedu();

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: IMAGE_ID });

    // The cap travels from the contracts constant. Passing it is what makes
    // raising it a one-line change with no migration.
    //
    // The dimensions are the re-encode's own, NOT the 1920 x 1080 the form
    // claimed: what a client says about its picture is an early plausibility
    // refusal and never reaches a column.
    expect(mockRpc).toHaveBeenCalledWith("add_group_session_image", {
      p_group_id: GROUP_ID,
      p_session_date: SESSION_DATE,
      p_width: CLEAN_WIDTH,
      p_height: CLEAN_HEIGHT,
      p_max_images: SESSION_PHOTO_CAP,
    });

    // Named by the row's id, one format, never overwritten, cached for a year:
    // the four properties that make the URL both unguessable and immutable.
    // The body is the re-encoded buffer rather than the file that arrived —
    // what is stored has to be the artifact whose dimensions the row holds.
    expect(mockUpload).toHaveBeenCalledWith(
      `${IMAGE_ID}.jpg`,
      expect.anything(),
      expect.objectContaining({
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: "31536000",
      }),
    );

    // The sweep belongs to the failure path alone: a stored photo is removed by
    // the gedu's own control, never by the route that just wrote it.
    expect(mockRemove).not.toHaveBeenCalled();
  });

  // --- The strip, and the measurement -------------------------------------

  it("refuses bytes that claim to be a JPEG and will not decode", async () => {
    mockGedu();
    // Past the magic-byte sniff and nowhere near a decodable picture. Same
    // answer as a raw HEIC: the gedu's move is to convert it and try again.
    const truncated = new File(
      [new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x00])],
      "broken.jpg",
      { type: "image/jpeg" },
    );

    const response = await POST(createRequest({ file: truncated }));

    expect(await refusal(response)).toEqual({ status: 415, code: "notJpeg" });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("strips EXIF and GPS from the bytes it stores", async () => {
    mockGedu();
    // A photo of a session carries coordinates and a capture time, and a report
    // about a child is the last place to forward them. The browser already
    // strips both on the honest path; this is the half that holds when the
    // client did not run it.
    const gps = new File([new Uint8Array(exifJpeg)], "IMG_0042.jpg", {
      type: "image/jpeg",
    });

    // The fixture really does carry what it claims to — a test asserting the
    // absence of something that was never there would pass forever.
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
    mockGedu();
    // The fixture is encoded 40 x 10 with an orientation tag that rotates it,
    // so the true picture is 10 x 40. A route that trusted the file's own
    // header — or the form's claim — would store it the other way round, and
    // every gallery box and every mail's image box is arithmetic from these two
    // numbers.
    const gps = new File([new Uint8Array(exifJpeg)], "IMG_0042.jpg", {
      type: "image/jpeg",
    });

    await POST(createRequest({ file: gps }));

    expect(mockRpc).toHaveBeenCalledWith(
      "add_group_session_image",
      expect.objectContaining({
        p_width: EXIF_FIXTURE_ENCODED_HEIGHT,
        p_height: EXIF_FIXTURE_ENCODED_WIDTH,
      }),
    );
  });

  it("stores nothing when the insert is refused", async () => {
    mockGedu();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Forbidden" },
    });

    const response = await POST(createRequest());

    expect(await refusal(response)).toEqual({
      status: 403,
      code: "notAllowed",
    });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("answers the cap refusal with a code of its own", async () => {
    mockGedu();
    // Reachable even though the editor hides its add control at the cap: two
    // tabs racing both see four photos, and the RPC under the session lock is
    // what actually decides. The gedu's answer is "remove one first".
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: SESSION_PHOTO_CAP_REACHED_SQLSTATE,
        message: "This session already holds 5 photos, which is the cap",
      },
    });

    const response = await POST(createRequest());

    expect(await refusal(response)).toEqual({
      status: 409,
      code: "capReached",
    });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("answers a check violation generically, having bounded the dimensions itself", async () => {
    mockGedu();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "No scheduled session on that date" },
    });

    expect(await refusal(await POST(createRequest()))).toEqual({
      status: 400,
      code: "uploadFailed",
    });
  });

  // --- Compensation --------------------------------------------------------

  it("unwinds both halves when the object cannot be stored", async () => {
    mockGedu();
    mockUpload.mockResolvedValue({ error: { message: "storage exploded" } });
    mockRpc
      .mockResolvedValueOnce({ data: IMAGE_ID, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(createRequest());

    // The object is swept even though the upload reported failure: a timeout or
    // a 5xx on the tail of a PUT whose bytes already landed leaves one behind
    // that no row names, and so that nothing in the system would ever delete.
    expect(mockRemove).toHaveBeenCalledWith([`${IMAGE_ID}.jpg`]);
    // A row whose object never landed would render as a broken image on the
    // staff card and in every mail sent afterwards, so it must not survive.
    expect(mockRpc).toHaveBeenLastCalledWith("delete_group_session_image", {
      p_image_id: IMAGE_ID,
    });
    expect(await refusal(response)).toEqual({
      status: 500,
      code: "uploadFailed",
    });
  });

  it("still deletes the row when the object sweep itself fails", async () => {
    mockGedu();
    mockUpload.mockResolvedValue({ error: { message: "storage exploded" } });
    mockRemove.mockResolvedValue({ error: { message: "no such object" } });
    mockRpc
      .mockResolvedValueOnce({ data: IMAGE_ID, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(createRequest());

    // The sweep is best effort — on the ordinary failure there was never an
    // object to remove — so its refusal is logged and carried past. The row is
    // the half that has to come out.
    expect(mockRpc).toHaveBeenLastCalledWith("delete_group_session_image", {
      p_image_id: IMAGE_ID,
    });
    expect(await refusal(response)).toEqual({
      status: 500,
      code: "uploadFailed",
    });
  });

  it("stops after a failed compensation rather than building machinery for it", async () => {
    mockGedu();
    mockUpload.mockResolvedValue({ error: { message: "storage exploded" } });
    mockRpc
      .mockResolvedValueOnce({ data: IMAGE_ID, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "XX000", message: "the delete failed too" },
      });

    const response = await POST(createRequest());

    // The row survives with no object. That renders as a broken thumbnail on the
    // staff card, and the ordinary remove control beside it is the repair — the
    // failure is logged loudly and nothing else happens.
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(await refusal(response)).toEqual({
      status: 500,
      code: "uploadFailed",
    });
  });

  it("never reaches a table with the service-role client", async () => {
    mockGedu();

    await POST(createRequest());

    // The admin client is here for the policy-less bucket and nothing else; who
    // may attach a photo is decided entirely by the guard on the user client.
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });
});
