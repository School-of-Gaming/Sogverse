import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { PREVIEW_IMAGE_BUDGET_BYTES } from "@/lib/images/preview-budget";

const mockDownload = vi.fn();
const mockFrom = vi.fn();
const mockCreateClient = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    mockCreateClient(...args);
    return {
      storage: {
        from: (bucket: string) => {
          mockFrom(bucket);
          return { download: (path: string) => mockDownload(path) };
        },
      },
    };
  },
}));

const mockCreateServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => mockCreateServerClient(...args),
}));

const { GET } = await import("@/app/opengraph-images/picture/[purpose]/[path]/route");

/**
 * A stored catalogue picture served to a link preview — a route handler, so an
 * integration test.
 *
 * What is pinned is the guarantee the route exists for: whatever is stored,
 * what comes back is a PNG or a JPEG no wider than preview width and under the
 * preview budget, cached for a year — and the route reaches only a public
 * catalogue bucket, only by a catalogue object key, only as anon.
 */

const KEY = "5f70bf18a086007016e948b04aed3b82103a36bea41755b6cddfaf10ace3c6ef.png";

/**
 * RGB noise from a fixed seed (xorshift32), so every run encodes the same
 * pixels and a size near the budget cannot pass on one run and fail the next.
 */
function noise(width: number, height: number): Buffer {
  const pixels = Buffer.alloc(width * height * 3);
  let state = 0x9e3779b9;
  for (let i = 0; i < pixels.length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    pixels[i] = state & 0xff;
  }
  return pixels;
}

/**
 * A photographic picture: noise blurred to the detail a photo has. Unblurred,
 * noise is beyond any JPEG quality the encoder tries; blurred, it is a fair
 * stand-in for the photos that are stored.
 */
async function photograph(width: number, height: number): Promise<Buffer> {
  return sharp(noise(width, height), { raw: { width, height, channels: 3 } })
    .blur(1.5)
    .png()
    .toBuffer();
}

function stored(bytes: Buffer, type: string): { data: Blob; error: null } {
  return { data: new Blob([new Uint8Array(bytes)], { type }), error: null };
}

function picture(purpose: string, path: string) {
  return GET(
    new Request(`https://sogverse.test/opengraph-images/picture/${purpose}/${path}`),
    { params: Promise.resolve({ purpose, path }) },
  );
}

describe("GET /opengraph-images/picture/[purpose]/[path]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves a megabyte-class product PNG as a JPEG under the preview budget, cached for a year", async () => {
    const original = await photograph(1200, 800);
    expect(original.length).toBeGreaterThan(PREVIEW_IMAGE_BUDGET_BYTES);
    mockDownload.mockResolvedValue(stored(original, "image/png"));

    const response = await picture("product", KEY);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.length).toBeLessThanOrEqual(PREVIEW_IMAGE_BUDGET_BYTES);
    expect(await sharp(body).metadata()).toMatchObject({
      format: "jpeg",
      width: 1200,
      height: 800,
    });
    expect(mockFrom).toHaveBeenCalledWith("product-images");
    expect(mockDownload).toHaveBeenCalledWith(KEY);
  });

  it("narrows a 1600×900 Library cover to preview width", async () => {
    const cover = await sharp(await photograph(1600, 900)).jpeg({ quality: 90 }).toBuffer();
    mockDownload.mockResolvedValue(stored(cover, "image/jpeg"));

    const response = await picture("library_cover", KEY.replace(".png", ".jpg"));

    expect(response.status).toBe(200);
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.length).toBeLessThanOrEqual(PREVIEW_IMAGE_BUDGET_BYTES);
    expect(await sharp(body).metadata()).toMatchObject({ width: 1200, height: 675 });
    expect(mockFrom).toHaveBeenCalledWith("library-covers");
  });

  it("serves a small JPEG as a JPEG", async () => {
    const small = await sharp({
      create: { width: 600, height: 400, channels: 3, background: "#336699" },
    })
      .jpeg()
      .toBuffer();
    mockDownload.mockResolvedValue(stored(small, "image/jpeg"));

    const response = await picture("product", KEY.replace(".png", ".jpg"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(await sharp(Buffer.from(await response.arrayBuffer())).metadata()).toMatchObject({
      format: "jpeg",
      width: 600,
    });
  });

  it("reads storage as anon, never with a cookie-reading client", async () => {
    mockDownload.mockResolvedValue(stored(await photograph(300, 200), "image/png"));

    await picture("product", KEY);

    expect(mockCreateServerClient).not.toHaveBeenCalled();
    expect(mockCreateClient).toHaveBeenCalledWith(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      expect.objectContaining({ auth: { persistSession: false } }),
    );
  });

  it.each(["team_photo", "chat_image", "session_photo", "constructor", "products"])(
    "answers 404 for %s, which is not a catalogue purpose, without asking storage",
    async (purpose) => {
      const response = await picture(purpose, KEY);

      expect(response.status).toBe(404);
      expect(mockDownload).not.toHaveBeenCalled();
    },
  );

  it.each([
    "minecraft.png",
    `${KEY.slice(0, 64)}.svg`,
    KEY.toUpperCase(),
    `..%2F${KEY}`,
    `${KEY.slice(0, 63)}.png`,
  ])("answers 404 for %s, which is not a catalogue object key, without asking storage", async (path) => {
    const response = await picture("product", path);

    expect(response.status).toBe(404);
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it("answers 404 for an object that is not there", async () => {
    mockDownload.mockResolvedValue({ data: null, error: { message: "Object not found" } });

    const response = await picture("product", KEY);

    expect(response.status).toBe(404);
  });

  it("answers 500, logged, never an oversized image, for a picture nothing fits under budget", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    // Unblurred noise: no JPEG quality on the ladder brings it under budget.
    const png = await sharp(noise(1200, 800), { raw: { width: 1200, height: 800, channels: 3 } })
      .png()
      .toBuffer();
    mockDownload.mockResolvedValue(stored(png, "image/png"));

    const response = await picture("product", KEY);

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).not.toMatch(/^image\//);
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });

  it("answers 500, logged, for stored bytes that are not a picture", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    mockDownload.mockResolvedValue(
      stored(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]), "image/png"),
    );

    const response = await picture("product", KEY);

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).not.toMatch(/^image\//);
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });
});
