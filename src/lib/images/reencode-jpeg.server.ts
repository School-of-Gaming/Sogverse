import "server-only";
import sharp from "sharp";

/**
 * The server-side half of image normalization: one re-encode that makes the
 * EXIF/GPS strip a **mechanism** rather than a hope, and that measures the
 * dimensions the row will store.
 *
 * The browser already normalizes every pick before it is uploaded — decode,
 * downscale, re-encode — and that pass is what keeps the body small and the
 * bucket single-format. What it cannot be is a *guarantee*: a modified client
 * (devtools suffices) posts whatever bytes it likes, and on the chat route the
 * uploader is any child or parent rather than an assigned member of staff. So
 * both upload routes run their verified bytes through this before storing them,
 * and the client pass stays as the honest path's pre-shrink.
 *
 * Two properties, and they are the whole of it:
 *
 * - **Orientation is baked into the pixels, then all metadata is dropped.**
 *   `rotate()` with no argument applies the EXIF orientation tag; the JPEG
 *   encode then carries no metadata forward, because sharp emits none unless
 *   asked. Doing them in that order is load-bearing — stripping first would
 *   land every phone photo on its side.
 * - **The dimensions come back measured, never claimed.** They are what the
 *   image row stores, and every thumbnail box in a chat log and every image box
 *   in a report email is arithmetic from them. A fabricated `1 × 20000` would
 *   be a layout bomb in every viewer's log, so the number a client sent is not
 *   consulted at all.
 *
 * **It re-encodes; it does not rescue.** There is no downscale here, on
 * purpose: the honest path arrives already inside the edge cap, and an image
 * whose true dimensions are implausible is *refused* by the send RPC's bound
 * rather than quietly resized into one. That is the same posture the routes
 * take about the bytes themselves — verify, never rescue — and it keeps this
 * helper a single fact about a single pass.
 */

/**
 * The JPEG quality this re-encode writes at, as sharp counts it (1–100).
 *
 * The same figure the browser pass uses on its way in, where a canvas counts it
 * 0–1: 0.8 there, 80 here. It is stated rather than imported because the two
 * APIs do not share a scale, and a converted constant would read as arithmetic
 * on a number that is really just the same choice spelled twice.
 */
const JPEG_QUALITY = 80;

/** One re-encoded image: the bytes to store, and their measured size. */
export interface ReencodedJpeg {
  /** The re-encoded JPEG. No EXIF, no GPS, no colour profile, no comment. */
  bytes: Buffer;
  /** The output's true pixel width, after orientation was applied. */
  width: number;
  /** The output's true pixel height, after orientation was applied. */
  height: number;
}

/**
 * Re-encode one already-verified image as a plain JPEG, and measure it.
 *
 * Throws whatever sharp throws when the bytes will not decode. A caller has
 * already checked the JPEG start-of-image marker by the time it gets here, so a
 * failure means the file is truncated or corrupt past its first three bytes —
 * which is a refusal, and each route words it in its own vocabulary.
 */
export async function reencodeJpeg(input: Buffer): Promise<ReencodedJpeg> {
  const { data, info } = await sharp(input)
    // No argument: apply the orientation the EXIF tag claims, then forget it.
    .rotate()
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return { bytes: data, width: info.width, height: info.height };
}
