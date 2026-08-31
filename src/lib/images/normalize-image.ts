// Browser-side image normalization: the edge-of-trust pass every uploaded
// session photo goes through before it ever reaches a route.
//
// One decode → downscale → re-encode pass solves four problems at once:
//
//   - a 4K screenshot becomes a few hundred KB, so the upload sits far under
//     the ~4.5 MB Vercel function-body limit and no direct-to-storage
//     machinery is needed;
//   - any accepted input format becomes JPEG, so the bucket holds exactly one
//     format and the report email renders everywhere (Outlook's desktop client
//     renders no WebP, and the email is a primary reading surface);
//   - **EXIF/GPS is stripped for free** — a canvas re-encode carries no
//     metadata forward. That is safeguarding, not tidiness: a phone photo of a
//     session carries coordinates and a capture time, and a report about a
//     child is the last place to forward them;
//   - orientation is baked into the pixels rather than left in a tag no
//     `<img>`-less consumer honours.
//
// **Every input is re-encoded, including one already inside the size cap.**
// Uniformity is the point — it is what makes the EXIF strip a guarantee rather
// than a usual outcome.
//
// **The file input this feeds names only web formats**
// (`accept="image/jpeg,image/png,image/webp"`). HEIC is excluded deliberately:
// browsers cannot decode it, but iOS Safari transcodes a photo-library pick to
// JPEG on its way through an input whose accept list excludes HEIC — so the
// mainline iPhone path works with no code at all. Raw HEIC still arrives by the
// side doors (a Files-app pick, a macOS drag-drop) and is refused by server
// verification with copy the gedu can act on; there is no decode shim, on
// purpose. The canonical accept-list constant lives with the feature's other
// contracts, not here.

import { fitWithinMaxEdge, type ImageDimensions } from "./image-dimensions";

/**
 * The ways this pass can fail, as stable codes rather than messages.
 *
 * Client-side refusals share one vocabulary with the server's, so the UI
 * resolves either through the same translation lookup and never renders a
 * thrown `Error`'s own text. The feature's contracts module is where the union
 * of *all* refusal codes lives; these are the two this module can raise.
 */
export const NORMALIZE_IMAGE_ERROR_CODES = [
  /** The browser refused to decode the bytes — corrupt file, or raw HEIC. */
  "decodeFailed",
  /** The canvas produced no JPEG — out of memory, or a tainted context. */
  "encodeFailed",
] as const;

export type NormalizeImageErrorCode =
  (typeof NORMALIZE_IMAGE_ERROR_CODES)[number];

export class NormalizeImageError extends Error {
  readonly code: NormalizeImageErrorCode;

  constructor(code: NormalizeImageErrorCode, options?: { cause?: unknown }) {
    super(`Image normalization failed: ${code}`, options);
    this.name = "NormalizeImageError";
    this.code = code;
  }
}

export interface NormalizeImageOptions {
  /**
   * Cap on the longest edge, in pixels. An image inside it keeps its pixels;
   * anything larger is scaled down to fit.
   */
  maxEdge?: number;
  /** JPEG quality, 0–1, handed straight to `canvas.toBlob`. */
  quality?: number;
}

export interface NormalizedImage {
  /** The re-encoded JPEG. */
  blob: Blob;
  /** The encoded pixel dimensions — what the route claims and the row stores. */
  width: number;
  height: number;
}

/**
 * The defaults exist so this module stands on its own and can be exercised
 * without the feature's contracts in scope. **They are not the point of
 * control**: the upload path passes the canonical values explicitly, and those
 * live in the feature's contracts module beside the photo cap and the byte
 * cap. Changing the pipeline's tuning means changing them there.
 */
const FALLBACK_MAX_EDGE = 2048;
const FALLBACK_QUALITY = 0.8;

/**
 * The JPEG's ground where the source had none.
 *
 * JPEG carries no alpha, so a transparent PNG or WebP has to be flattened onto
 * something, and an unpainted canvas flattens to black. This is a property of
 * the *image's own pixels* rather than of the UI around it — the same photo has
 * to read in the app, in the fullscreen viewer and in an email body — so it is
 * white, the conventional flattening ground every image tool uses, and not a
 * value from the app's dark palette. Session photos are overwhelmingly opaque
 * screenshots and camera photos; this only ever shows on the rare pick that
 * genuinely has transparency.
 */
const JPEG_FLATTEN_GROUND = "#ffffff";

/**
 * Decode `file`, downscale it under the edge cap, and re-encode it as JPEG.
 *
 * Browser-only — it reaches for `createImageBitmap` and a `<canvas>`, so it
 * belongs behind a client component and never on a render path the server runs.
 */
export async function normalizeImage(
  file: Blob,
  options: NormalizeImageOptions = {},
): Promise<NormalizedImage> {
  const { maxEdge = FALLBACK_MAX_EDGE, quality = FALLBACK_QUALITY } = options;

  // `imageOrientation: "from-image"` is stated rather than left to the
  // default: a phone photo's rotation lives in an EXIF tag that this pass is
  // about to throw away, so it has to be applied to the pixels first or every
  // portrait shot lands on its side.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (cause) {
    throw new NormalizeImageError("decodeFailed", { cause });
  }

  try {
    const size = fitWithinMaxEdge(bitmap, maxEdge);
    const blob = await drawToJpeg(bitmap, size, quality);
    return { blob, width: size.width, height: size.height };
  } finally {
    // A decoded 12 MP bitmap is ~48 MB of uncompressed pixels; a 5-photo batch
    // that leaves them to the collector is a real memory spike on a phone.
    bitmap.close();
  }
}

async function drawToJpeg(
  bitmap: ImageBitmap,
  size: ImageDimensions,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new NormalizeImageError("encodeFailed");

  // A 4K screenshot loses three quarters of its pixels here in one step, and
  // the default "low" filter aliases fine detail (in-game text especially).
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = JPEG_FLATTEN_GROUND;
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(bitmap, 0, 0, size.width, size.height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
  if (!blob) throw new NormalizeImageError("encodeFailed");
  return blob;
}
