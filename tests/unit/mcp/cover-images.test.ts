import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COVER_PREVIEW,
  COVER_THUMBNAIL,
  IMAGE_BUDGET_CHARS,
  MAX_IMAGES_PER_RESULT,
  answerWithCovers,
  coverImage,
} from "@/lib/mcp/cover-images";

/**
 * **A cover as a picture the model sees, within what a client accepts.** The
 * originals come from a stubbed bucket as real JPEGs, so the sizes measured
 * here are real re-encodes.
 */

const SUPABASE_URL = "https://project.supabase.co";

/** A JPEG full of noise, which compresses badly and so is large at any size. */
function noisyJpeg(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 7919 + (i >> 5) * 104729) % 256;
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100 }).toBuffer();
}

function serve(body: Buffer | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      body ? new Response(new Uint8Array(body)) : new Response("gone", { status: 404 }),
    ),
  );
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("coverImage", () => {
  it("fits a cover inside the box whole, keeping an old entry's own shape", async () => {
    serve(await sharp({ create: { width: 1200, height: 800, channels: 3, background: "black" } }).jpeg().toBuffer());

    const image = await coverImage("old.jpg", COVER_THUMBNAIL);

    const meta = await sharp(Buffer.from(image?.data ?? "", "base64")).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 216, 144]);
  });

  it("never enlarges a small picture", async () => {
    serve(await sharp({ create: { width: 100, height: 50, channels: 3, background: "black" } }).png().toBuffer());

    const image = await coverImage("tiny.png", COVER_PREVIEW);

    const meta = await sharp(Buffer.from(image?.data ?? "", "base64")).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 100, 50]);
  });

  it("answers null for a picture that cannot be loaded or read", async () => {
    serve(null);
    expect(await coverImage("gone.jpg", COVER_PREVIEW)).toBeNull();

    serve(Buffer.from("not a picture"));
    expect(await coverImage("junk.jpg", COVER_PREVIEW)).toBeNull();
  });
});

describe("answerWithCovers", () => {
  const covers = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ path: `c${i}.jpg`, caption: `Cover ${i}` }));

  it("puts each caption right before its picture, after the JSON", async () => {
    serve(await sharp({ create: { width: 1600, height: 900, channels: 3, background: "black" } }).jpeg().toBuffer());

    const result = await answerWithCovers({ a: 1 }, covers(2), COVER_THUMBNAIL);

    expect(result.structuredContent).toEqual({ a: 1 });
    expect(result.content.map((block) => block.type)).toEqual(["text", "text", "image", "text", "image"]);
    expect(result.content[1]).toEqual({ type: "text", text: "Cover 0" });
  });

  it("pictures at most the per-result count and names how many more there are", async () => {
    serve(await sharp({ create: { width: 1600, height: 900, channels: 3, background: "black" } }).jpeg().toBuffer());

    const result = await answerWithCovers({}, covers(MAX_IMAGES_PER_RESULT + 3), COVER_THUMBNAIL);

    expect(result.content.filter((block) => block.type === "image")).toHaveLength(MAX_IMAGES_PER_RESULT);
    expect(result.content.at(-1)).toMatchObject({
      text: expect.stringContaining("3 more cover(s) are not pictured"),
    });
  });

  it("stops at the size budget, keeps every caption, and stays under a client's 1 MB", async () => {
    serve(await noisyJpeg(1600, 900));

    const result = await answerWithCovers({}, covers(8), COVER_PREVIEW);

    const images = result.content.flatMap((block) => (block.type === "image" ? [block] : []));
    const chars = images.reduce((sum, image) => sum + image.data.length, 0);
    expect(images.length).toBeGreaterThan(0);
    expect(images.length).toBeLessThan(8);
    expect(chars).toBeLessThanOrEqual(IMAGE_BUDGET_CHARS);
    for (let i = 0; i < 8; i++) {
      expect(result.content.some((block) => block.type === "text" && block.text.startsWith(`Cover ${i}`))).toBe(true);
    }
    expect(JSON.stringify(result).length).toBeLessThan(1_000_000);
  });
});
