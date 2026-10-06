import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  encodeWithinBudget,
  ImageOverBudgetError,
  PREVIEW_IMAGE_BUDGET_BYTES,
} from "@/lib/images/encode-within-budget.server";

/** A flat, single-colour picture: what a drawn card compresses like. */
function flatPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } },
  })
    .png()
    .toBuffer();
}

/**
 * Random pixels, softened: like a photograph, far over budget as a PNG and
 * within reach of the JPEG ladder. Unblurred noise is beyond what any JPEG
 * rung can bring under budget, which is the over-budget case's input instead.
 */
function photoPng(
  width: number,
  height: number,
  { channels = 3, blur = true }: { channels?: 3 | 4; blur?: boolean } = {},
): Promise<Buffer> {
  const pixels = sharp(randomBytes(width * height * channels), {
    raw: { width, height, channels },
  });
  return (blur ? pixels.blur(1.5) : pixels).png().toBuffer();
}

describe("encodeWithinBudget", () => {
  it("keeps a small flat PNG as a PNG under budget", async () => {
    const input = await flatPng(1200, 630);
    const result = await encodeWithinBudget(input);

    expect(result.contentType).toBe("image/png");
    expect(result.bytes.length).toBeLessThanOrEqual(PREVIEW_IMAGE_BUDGET_BYTES);
    expect({ width: result.width, height: result.height }).toEqual({ width: 1200, height: 630 });
    expect((await sharp(result.bytes).metadata()).format).toBe("png");
  });

  it("turns a photographic PNG over budget into a JPEG under it", async () => {
    const noise = await photoPng(1200, 800);
    expect(noise.length).toBeGreaterThan(PREVIEW_IMAGE_BUDGET_BYTES);

    const result = await encodeWithinBudget(noise);

    expect(result.contentType).toBe("image/jpeg");
    expect(result.bytes.length).toBeLessThanOrEqual(PREVIEW_IMAGE_BUDGET_BYTES);
    expect((await sharp(result.bytes).metadata()).format).toBe("jpeg");
  });

  it("downscales a wide input to the preview width with its aspect kept", async () => {
    const result = await encodeWithinBudget(await flatPng(1600, 900));

    expect({ width: result.width, height: result.height }).toEqual({ width: 1200, height: 675 });
    const measured = await sharp(result.bytes).metadata();
    expect({ width: measured.width, height: measured.height }).toEqual({
      width: 1200,
      height: 675,
    });
  });

  it("does not enlarge a narrow input", async () => {
    const input = await sharp({
      create: { width: 400, height: 300, channels: 3, background: "#808080" },
    })
      .jpeg()
      .toBuffer();
    const result = await encodeWithinBudget(input);

    expect({ width: result.width, height: result.height }).toEqual({ width: 400, height: 300 });
  });

  it("bakes EXIF orientation into the pixels", async () => {
    // Stored 400 × 200 with orientation 6 (rotate 90° clockwise to view), so
    // the upright picture is 200 × 400.
    const sideways = await sharp({
      create: { width: 400, height: 200, channels: 3, background: "#808080" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await encodeWithinBudget(sideways);

    expect({ width: result.width, height: result.height }).toEqual({ width: 200, height: 400 });
    const measured = await sharp(result.bytes).metadata();
    expect({ width: measured.width, height: measured.height }).toEqual({
      width: 200,
      height: 400,
    });
    expect(measured.orientation ?? 1).toBe(1);
  });

  it("throws ImageOverBudgetError when nothing fits, carrying the sizes", async () => {
    const input = await photoPng(800, 600, { blur: false });
    const error: unknown = await encodeWithinBudget(input, { budgetBytes: 2 * 1024 }).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(ImageOverBudgetError);
    const sizes =
      error instanceof ImageOverBudgetError
        ? { budget: error.budgetBytes, smallest: error.smallestBytes }
        : undefined;
    expect(sizes?.budget).toBe(2 * 1024);
    expect(sizes?.smallest).toBeGreaterThan(2 * 1024);
  });

  it("flattens a transparent PNG to an opaque JPEG when it falls to JPEG", async () => {
    const input = await photoPng(1200, 800, { channels: 4 });
    expect((await sharp(input).metadata()).hasAlpha).toBe(true);
    expect(input.length).toBeGreaterThan(PREVIEW_IMAGE_BUDGET_BYTES);

    const result = await encodeWithinBudget(input);

    expect(result.contentType).toBe("image/jpeg");
    const measured = await sharp(result.bytes).metadata();
    expect(measured.hasAlpha).toBe(false);
    expect(measured.channels).toBe(3);
  });
});
