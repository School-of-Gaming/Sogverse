// @vitest-environment node
//
// Node environment so Request, FormData and File are all undici/Node natives
// from one realm: jsdom's FormData is not serializable by undici's Request, and
// a file parsed back out of a real multipart body would fail the route's
// `instanceof File` check against jsdom's File.

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { POST } from "@/app/api/team/profiles/[userId]/photo/route";
import { IMAGE_PURPOSES } from "@/lib/images/image-purposes";
import { TEAM_PHOTO_URL_TTL_SECONDS } from "@/services/team-profiles/team-profiles.types";
import { storeTeamPhotoResponse } from "@/services/team-profiles/team-profiles.contracts";
import { carriesExif, containsText, plainJpeg } from "../../mocks/exif-jpeg";

/**
 * POST /api/team/profiles/[userId]/photo — storing a new team photo.
 *
 * The route is the team-photos bucket's only writer, so every refusal below
 * asserts that nothing reached storage: a refusal that still wrote something
 * is the failure the bucket's invariant is about. The happy path holds the
 * other half — what is stored is the re-encoded JPEG, metadata gone, at the
 * registry's stored size, in the person's own folder.
 */

// --- Mocks -----------------------------------------------------------------

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockUpload = vi.fn();
const mockStorageFrom = vi.fn(() => ({ upload: mockUpload }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: mockStorageFrom } }),
}));

const mockRpc = vi.fn();

// --- Fixtures --------------------------------------------------------------

const TARGET_ID = "3f6c2b9e-8a41-4d7f-b2c5-91e0a6d4f3b8";
const { width: STORED_WIDTH, height: STORED_HEIGHT } =
  IMAGE_PURPOSES.team_photo.storedSize;

const GPS_DATE_STAMP = "2026:09:01";
const COPYRIGHT = "Sogverse team photo fixture";

/** A crop at the stored size, as the editor makes one. */
let cropJpeg: Buffer;
/** The same size, carrying GPS and a copyright string. */
let exifCropJpeg: Buffer;

beforeAll(async () => {
  cropJpeg = await plainJpeg(STORED_WIDTH, STORED_HEIGHT);
  exifCropJpeg = await sharp({
    create: {
      width: STORED_WIDTH,
      height: STORED_HEIGHT,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .withExif({
      IFD0: { Copyright: COPYRIGHT },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "60/1 10/1 0/1",
        GPSDateStamp: GPS_DATE_STAMP,
      },
    })
    .jpeg()
    .toBuffer();
});

function jpegFile(bytes: Uint8Array = cropJpeg): File {
  return new File([new Uint8Array(bytes)], "team-photo.jpg", {
    type: "image/jpeg",
  });
}

function call(
  options: { file?: File | null; userId?: string } = {},
): Promise<Response> {
  const form = new FormData();
  const file = "file" in options ? options.file : jpegFile();
  if (file) form.append("file", file);
  const userId = options.userId ?? TARGET_ID;
  return POST(
    new Request(`http://localhost:3000/api/team/profiles/${userId}/photo`, {
      method: "POST",
      body: form,
    }),
    { params: Promise.resolve({ userId }) },
  );
}

function mockEditor(mayEdit = true): void {
  mockRequireRole.mockResolvedValue({
    user: { id: "gedu-user-id" },
    profile: { id: "gedu-user-id", role: "gedu", first_name: "Marianne" },
    supabase: { rpc: mockRpc },
  });
  mockRpc.mockResolvedValue({ data: mayEdit, error: null });
}

/** The bytes the route handed to storage. */
function uploadedBytes(): Buffer {
  const body: unknown = mockUpload.mock.calls[0][1];
  if (!Buffer.isBuffer(body)) {
    throw new Error("the route stored something that was not a buffer");
  }
  return body;
}

describe("POST /api/team/profiles/[userId]/photo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue({ error: null });
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await call();

    expect(response.status).toBe(401);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("returns 403 for a role that has no team profile", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await call();

    expect(response.status).toBe(403);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("gates on an admin or a Gedu", async () => {
    mockEditor();
    await call();

    expect(mockRequireRole).toHaveBeenCalledWith(
      ["admin", "gedu"],
      expect.anything(),
    );
  });

  it("refuses a profile the caller may not edit, on the caller's own client", async () => {
    mockEditor(false);

    const response = await call();

    expect(response.status).toBe(403);
    expect(mockRpc).toHaveBeenCalledWith("can_edit_team_profile", {
      p_user_id: TARGET_ID,
    });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("answers 500 and stores nothing when the edit check fails", async () => {
    mockEditor();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "08006", message: "connection failure" },
    });

    const response = await call();

    expect(response.status).toBe(500);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses a target that is not a uuid", async () => {
    mockEditor();

    const response = await call({ userId: "not-a-uuid" });

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses a form with no file", async () => {
    mockEditor();

    const response = await call({ file: null });

    expect(response.status).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses an upload over the byte cap", async () => {
    mockEditor();
    const tooBig = new File(
      [new Uint8Array(IMAGE_PURPOSES.team_photo.maxBytes + 1)],
      "huge.jpg",
      { type: "image/jpeg" },
    );

    const response = await call({ file: tooBig });

    expect(response.status).toBe(413);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses bytes that are not a JPEG, whatever the form claims", async () => {
    mockEditor();
    const png = await sharp({
      create: {
        width: STORED_WIDTH,
        height: STORED_HEIGHT,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png()
      .toBuffer();

    const response = await call({ file: jpegFile(png) });

    expect(response.status).toBe(415);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("refuses a JPEG that is not the stored size, rather than resizing it", async () => {
    mockEditor();
    const wrongSize = await plainJpeg(STORED_WIDTH, STORED_WIDTH);

    const response = await call({ file: jpegFile(wrongSize) });

    expect(response.status).toBe(422);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("stores the re-encoded crop in the person's folder and answers its path", async () => {
    mockEditor();

    const response = await call();

    expect(response.status).toBe(200);
    const { path } = storeTeamPhotoResponse.parse(await response.json());
    expect(path).toMatch(
      new RegExp(`^${TARGET_ID}/[0-9a-f-]{36}\\.jpg$`),
    );

    expect(mockStorageFrom).toHaveBeenCalledWith(IMAGE_PURPOSES.team_photo.bucket);
    expect(mockUpload).toHaveBeenCalledWith(
      path,
      expect.anything(),
      {
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: String(TEAM_PHOTO_URL_TTL_SECONDS),
      },
    );
    const stored = await sharp(uploadedBytes()).metadata();
    expect(stored).toMatchObject({
      format: "jpeg",
      width: STORED_WIDTH,
      height: STORED_HEIGHT,
    });
  });

  it("stores an uppercase id under its lowercase folder, and checks that id", async () => {
    mockEditor();

    const response = await call({ userId: TARGET_ID.toUpperCase() });

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("can_edit_team_profile", {
      p_user_id: TARGET_ID,
    });
    const { path } = storeTeamPhotoResponse.parse(await response.json());
    expect(path).toMatch(
      new RegExp(`^${TARGET_ID}/[0-9a-f-]{36}\\.jpg$`),
    );
    expect(mockUpload).toHaveBeenCalledWith(path, expect.anything(), expect.anything());
  });

  it("strips EXIF and GPS from the bytes it stores", async () => {
    mockEditor();
    // The fixture really does carry what it claims to — a test asserting the
    // absence of something that was never there would pass forever.
    expect(carriesExif(exifCropJpeg)).toBe(true);
    expect(containsText(exifCropJpeg, GPS_DATE_STAMP)).toBe(true);

    const response = await call({ file: jpegFile(exifCropJpeg) });
    expect(response.status).toBe(200);

    const stored = uploadedBytes();
    expect(carriesExif(stored)).toBe(false);
    expect(containsText(stored, GPS_DATE_STAMP)).toBe(false);
    expect(containsText(stored, COPYRIGHT)).toBe(false);
  });

  it("answers 500 when storage refuses the write", async () => {
    mockEditor();
    mockUpload.mockResolvedValue({ error: { message: "bucket unavailable" } });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await call();

    expect(response.status).toBe(500);
    consoleError.mockRestore();
  });
});
