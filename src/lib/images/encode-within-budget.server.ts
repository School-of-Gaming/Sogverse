import "server-only";
import sharp from "sharp";
import { JPEG_FLATTEN_GROUND } from "./normalize-image";
import { MAX_INPUT_PIXELS } from "./reencode-jpeg.server";

/**
 * **Bytes a link preview will actually show.** One pass that takes any picture
 * we are about to hand a link-preview crawler and returns it under a byte
 * budget, in a format every crawler accepts — or refuses loudly.
 *
 * WhatsApp fetches a page's `og:image` and, past roughly 300 KB, drops it
 * without a word: the preview simply arrives with no picture, and nothing on
 * our side ever hears about it. A drawn card with a photo in it, and a stored
 * product picture or Library cover served as itself, both cross that line, and
 * each emitter deciding for itself whether it is "probably small enough" is
 * how they crossed it. So the guarantee lives here, once: what comes back is
 * under budget, and a picture that cannot be made to fit throws rather than
 * shipping a preview that silently goes blank.
 *
 * The output is PNG or JPEG and nothing else. Those are the two formats every
 * preview consumer decodes; WebP and AVIF are smaller but not universally read
 * by crawlers, and a smaller preview nobody renders is no preview.
 */

/**
 * The most a preview image may weigh. WhatsApp drops preview images over
 * ~300 KB; the margin below that absorbs the difference between how we count a
 * kilobyte and how it does, and whatever headers ride along.
 */
export const PREVIEW_IMAGE_BUDGET_BYTES = 250 * 1024;

/**
 * The widest a preview image is served. 1200 is the width every platform's
 * card guidance designs to; anything wider is bytes the crawler scales away.
 */
export const PREVIEW_IMAGE_MAX_WIDTH = 1200;

/**
 * The JPEG qualities tried in turn, best first, as sharp counts them (1–100).
 * Three rungs because the useful range is narrow: above 85 a preview gains
 * nothing a phone-sized card can show, and below 65 a photo starts to block
 * visibly. A picture that misses at 65 at preview width is refused rather than
 * crushed further.
 */
const JPEG_QUALITY_LADDER = [85, 75, 65] as const;

/** One picture ready to serve to a link preview. */
export interface BudgetedImage {
  /** The encoded picture, never more than the budget it was asked for. */
  bytes: Buffer;
  /** What `bytes` is, for the response's `Content-Type`. */
  contentType: "image/png" | "image/jpeg";
  /** The output's pixel width, after orientation and any downscale. */
  width: number;
  /** The output's pixel height, after orientation and any downscale. */
  height: number;
}

/**
 * Thrown when no encode this pass tries brings the picture under budget. It
 * carries the smallest size reached so a caller can log how far off it was.
 */
export class ImageOverBudgetError extends Error {
  constructor(
    /** The smallest encode reached, in bytes. */
    readonly smallestBytes: number,
    /** The budget it had to fit, in bytes. */
    readonly budgetBytes: number,
  ) {
    super(
      `The image could not be encoded within ${budgetBytes} bytes; the smallest encode was ${smallestBytes} bytes.`,
    );
    this.name = "ImageOverBudgetError";
  }
}

/**
 * Encode `input` as a PNG or JPEG of at most `budgetBytes`, no wider than
 * `maxWidth`.
 *
 * - **Orientation is baked in** and the picture is downscaled to `maxWidth`
 *   with its aspect kept, never enlarged.
 * - **A PNG stays a PNG when it fits.** A drawn card — flat colour and text —
 *   is small and crisp as PNG and would only pick up ringing as JPEG, so a PNG
 *   that is under budget at preview width is kept. One that already is, as it
 *   arrived, is returned byte for byte.
 * - **Everything else becomes JPEG**, walking the quality ladder and returning
 *   the first rung under budget. JPEG has no alpha, so transparency is first
 *   flattened onto the browser-side normalizer's white ground — unflattened,
 *   libvips would paint it black.
 *
 * Throws `ImageOverBudgetError` when even the last rung is over budget, and
 * whatever sharp throws when the bytes will not decode or decode past
 * `MAX_INPUT_PIXELS`.
 */
export async function encodeWithinBudget(
  input: Buffer,
  options: { budgetBytes?: number; maxWidth?: number } = {},
): Promise<BudgetedImage> {
  const budgetBytes = options.budgetBytes ?? PREVIEW_IMAGE_BUDGET_BYTES;
  const maxWidth = options.maxWidth ?? PREVIEW_IMAGE_MAX_WIDTH;

  const metadata = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  const isPng = metadata.format === "png";

  // A PNG that already fits as it is — upright, narrow enough, under budget —
  // is what a drawn card usually is. Returning it untouched keeps the card
  // exactly as it was rendered.
  const upright = (metadata.orientation ?? 1) === 1;
  if (isPng && upright && metadata.width <= maxWidth && input.length <= budgetBytes) {
    return {
      bytes: input,
      contentType: "image/png",
      width: metadata.width,
      height: metadata.height,
    };
  }

  // One decode-orient-downscale pipeline, cloned for each encode tried.
  const prepared = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    // No argument: apply the orientation the EXIF tag claims, then forget it.
    .rotate()
    .resize({ width: maxWidth, fit: "inside", withoutEnlargement: true });

  let smallestBytes = Number.POSITIVE_INFINITY;

  if (isPng) {
    const { data, info } = await prepared
      .clone()
      .png()
      .toBuffer({ resolveWithObject: true });
    if (data.length <= budgetBytes) {
      return { bytes: data, contentType: "image/png", width: info.width, height: info.height };
    }
    smallestBytes = data.length;
  }

  for (const quality of JPEG_QUALITY_LADDER) {
    const { data, info } = await prepared
      .clone()
      .flatten({ background: JPEG_FLATTEN_GROUND })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    if (data.length <= budgetBytes) {
      return { bytes: data, contentType: "image/jpeg", width: info.width, height: info.height };
    }
    smallestBytes = Math.min(smallestBytes, data.length);
  }

  throw new ImageOverBudgetError(smallestBytes, budgetBytes);
}
