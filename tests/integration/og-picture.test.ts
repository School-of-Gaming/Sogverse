import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
import { PREVIEW_IMAGE_BUDGET_BYTES } from "@/lib/images/preview-budget";

/**
 * The route fetches the bucket's public object URL. Global `fetch` is replaced
 * so a test decides what storage answers and sees exactly what was asked for.
 */
const mockFetch = vi.fn<(input: string | URL | Request) => Promise<Response>>();
vi.stubGlobal("fetch", mockFetch);

/**
 * No Supabase client takes part: the public URL is the whole read. Both the
 * client library and the cookie-reading server client are mocked so a test can
 * prove neither is ever constructed.
 */
const mockCreateClient = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
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
 * what comes back is a PNG or a JPEG at exactly the size the page declares for
 * its purpose and under the preview budget, cached for a year — and the route
 * reaches only a public catalogue bucket, only by a catalogue object key, only
 * through that bucket's public object URL.
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

function stored(bytes: Buffer, type: string): Response {
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": type } });
}

const SUPABASE_URL = "https://project.supabase.test";

/** The public object URL of `path` in `bucket`, as storage serves it. */
function publicObjectUrl(bucket: string, path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

/** The body, after checking the declared `Content-Length` is its real length. */
async function served(response: Response): Promise<Buffer> {
  const body = Buffer.from(await response.arrayBuffer());
  expect(response.headers.get("content-length")).toBe(String(body.length));
  return body;
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
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves a megabyte-class product PNG as a JPEG under the preview budget, cached for a year", async () => {
    const original = await photograph(1200, 800);
    expect(original.length).toBeGreaterThan(PREVIEW_IMAGE_BUDGET_BYTES);
    mockFetch.mockResolvedValue(stored(original, "image/png"));

    const response = await picture("product", KEY);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    const body = await served(response);
    expect(body.length).toBeLessThanOrEqual(PREVIEW_IMAGE_BUDGET_BYTES);
    expect(await sharp(body).metadata()).toMatchObject({
      format: "jpeg",
      width: 1200,
      height: 800,
    });
    expect(mockFetch).toHaveBeenCalledExactlyOnceWith(publicObjectUrl("product-images", KEY));
  });

  it("crops an off-size legacy product picture to the declared 1200×800", async () => {
    const legacy = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: "#336699" },
    })
      .png()
      .toBuffer();
    mockFetch.mockResolvedValue(stored(legacy, "image/png"));

    const response = await picture("product", KEY);

    expect(response.status).toBe(200);
    expect(await sharp(await served(response)).metadata()).toMatchObject({
      width: 1200,
      height: 800,
    });
  });

  it("narrows a 1600×900 Library cover to the declared 1200×675", async () => {
    const cover = await sharp(await photograph(1600, 900)).jpeg({ quality: 90 }).toBuffer();
    mockFetch.mockResolvedValue(stored(cover, "image/jpeg"));

    const coverKey = KEY.replace(".png", ".jpg");
    const response = await picture("library_cover", coverKey);

    expect(response.status).toBe(200);
    const body = await served(response);
    expect(body.length).toBeLessThanOrEqual(PREVIEW_IMAGE_BUDGET_BYTES);
    expect(await sharp(body).metadata()).toMatchObject({ width: 1200, height: 675 });
    expect(mockFetch).toHaveBeenCalledExactlyOnceWith(publicObjectUrl("library-covers", coverKey));
  });

  it("serves a small JPEG as a JPEG, enlarged to the declared size", async () => {
    const small = await sharp({
      create: { width: 600, height: 400, channels: 3, background: "#336699" },
    })
      .jpeg()
      .toBuffer();
    mockFetch.mockResolvedValue(stored(small, "image/jpeg"));

    const response = await picture("product", KEY.replace(".png", ".jpg"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(await sharp(await served(response)).metadata()).toMatchObject({
      format: "jpeg",
      width: 1200,
      height: 800,
    });
  });

  it("reads the bucket's public object URL, with no Supabase client and no cookies", async () => {
    mockFetch.mockResolvedValue(stored(await photograph(300, 200), "image/png"));

    await picture("product", KEY);

    // A bare URL and nothing else: no init, so no cookie or key header rides
    // along, and storage answers as it would to anyone.
    expect(mockFetch).toHaveBeenCalledExactlyOnceWith(publicObjectUrl("product-images", KEY));
    expect(mockCreateServerClient).not.toHaveBeenCalled();
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it.each(["team_photo", "chat_image", "session_photo", "constructor", "products"])(
    "answers 404 for %s, which is not a catalogue purpose, without asking storage",
    async (purpose) => {
      const response = await picture(purpose, KEY);

      expect(response.status).toBe(404);
      expect(mockFetch).not.toHaveBeenCalled();
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
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([400, 404])(
    "answers 404, unlogged, for an object that is not there (storage answers %i)",
    async (status) => {
      const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
      mockFetch.mockResolvedValue(new Response("Object not found", { status }));

      const response = await picture("product", KEY);

      expect(response.status).toBe(404);
      expect(quiet).not.toHaveBeenCalled();
      quiet.mockRestore();
    },
  );

  it("answers 500, logged, never an oversized image, for a picture nothing fits under budget", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    // Unblurred noise: no JPEG quality on the ladder brings it under budget.
    const png = await sharp(noise(1200, 800), { raw: { width: 1200, height: 800, channels: 3 } })
      .png()
      .toBuffer();
    mockFetch.mockResolvedValue(stored(png, "image/png"));

    const response = await picture("product", KEY);

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).not.toMatch(/^image\//);
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });

  it("answers 500, logged, for stored bytes that are not a picture", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockResolvedValue(
      stored(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]), "image/png"),
    );

    const response = await picture("product", KEY);

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).not.toMatch(/^image\//);
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });
});
