import "server-only";
import { IMAGE_PURPOSES, MAX_IMAGE_EDGE, type ImagePurpose } from "./image-purposes";
import { reencodeJpeg, type ReencodedJpeg } from "./reencode-jpeg.server";

/**
 * The bytes-in half the server upload routes share: take the file out of the
 * form, refuse what the bucket must not hold, re-encode what it may, and check
 * the result against the purpose's declared size.
 *
 * The image catalogue's writers stand outside it by design. Their uploads come
 * only from admins and are mostly graphics rather than camera photos, and the
 * browser crop that produced them has already dropped the metadata, so they
 * are stored byte for byte after their own cap, type and exact-size checks.
 *
 * Steps rather than one call, because routes put their own work between them:
 * one reads a channel row as a cost gate after reading the form and before
 * spending a decode. Each step answers either its value or a refusal, never a
 * thrown error, so the route maps every reason to its own vocabulary and
 * nothing reaches the client in a shape the route did not choose. What stays
 * in each route is everything else — who may upload, the order of row and
 * object, the compensation when one half fails, the object's name.
 */

/**
 * A year, and safe for an object whose name can never be given different
 * bytes: every upload route names its object by a fresh id or by a hash of
 * its bytes, and uploads with `upsert: false`.
 */
export const IMMUTABLE_CACHE_CONTROL = "31536000";

/** JPEG's start-of-image marker, followed by the first segment's own marker. */
const JPEG_SOI = [0xff, 0xd8, 0xff];

/**
 * Why an upload was refused.
 *
 * - `noFile` — the form carried no `file` field.
 * - `tooLarge` — over the purpose's byte cap.
 * - `notJpeg` — the bytes do not begin with the JPEG start-of-image marker.
 * - `undecodable` — they do, and still will not decode (truncated, corrupt, or
 *   past the decoder's pixel bound).
 * - `wrongSize` — a purpose stored at a fixed size, and the picture is not
 *   exactly that size.
 * - `tooBig` — a purpose kept as uploaded, and the picture's longer edge is
 *   past the platform's maximum.
 */
export type ImageIngestRefusalReason =
  | "noFile"
  | "tooLarge"
  | "notJpeg"
  | "undecodable"
  | "wrongSize"
  | "tooBig";

/** The HTTP status each refusal is answered with, whatever route answers it. */
const STATUS: Record<ImageIngestRefusalReason, number> = {
  noFile: 400,
  tooLarge: 413,
  notJpeg: 415,
  undecodable: 415,
  wrongSize: 422,
  tooBig: 400,
};

/**
 * One refused upload: why, the status to answer it with, and an English
 * sentence for the log. The sentence is never shown to anyone; a route that
 * shows something picks its own copy from the reason.
 */
export interface ImageIngestRefusal {
  readonly ok: false;
  readonly reason: ImageIngestRefusalReason;
  readonly status: number;
  readonly detail: string;
}

/** A step's answer: its value, or the refusal. */
export type ImageIngestResult<T> = { readonly ok: true; readonly value: T } | ImageIngestRefusal;

function refuse(reason: ImageIngestRefusalReason, detail: string): ImageIngestRefusal {
  return { ok: false, reason, status: STATUS[reason], detail };
}

/**
 * The `file` field of an already-parsed form, as bytes, for `purpose`: refused
 * when it is missing, over the purpose's byte cap, or not a JPEG by its first
 * three bytes.
 *
 * The cap is checked before the bytes are read, and not to save memory —
 * parsing the form has already buffered the body, bounded by the platform's
 * request limit. The order is about the answer: an over-cap file gets the same
 * refusal whatever its first bytes say.
 *
 * The sniff is the whole of what "this is a JPEG" means here. The declared
 * content type is the client's claim about its own file and is not consulted,
 * and it runs before the re-encode rather than being left to it, because the
 * decoder would happily read a PNG or a WebP and a bucket holds one format.
 */
export async function readImageFile(
  formData: FormData,
  purpose: ImagePurpose,
): Promise<ImageIngestResult<Buffer>> {
  const file = formData.get("file");
  if (!(file instanceof File)) return refuse("noFile", "no 'file' field in the form");

  const { maxBytes } = IMAGE_PURPOSES[purpose];
  if (file.size > maxBytes) {
    return refuse("tooLarge", `the upload is ${file.size} bytes, over the ${maxBytes} cap`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!JPEG_SOI.every((byte, index) => bytes[index] === byte)) {
    return refuse("notJpeg", "the upload does not begin with a JPEG start-of-image marker");
  }
  return { ok: true, value: bytes };
}

/**
 * Re-encode verified bytes for `purpose` — orientation baked into the pixels,
 * every scrap of metadata dropped — and hold the measured result to the
 * purpose's stored size: exactly that size when the purpose declares one,
 * otherwise no edge past `MAX_IMAGE_EDGE`.
 *
 * The answer carries the re-encoded bytes, which are what a route stores, and
 * their measured dimensions, which are what a row records. Nothing a client
 * claimed about the picture's size is consulted.
 */
export async function reencodeForPurpose(
  bytes: Buffer,
  purpose: ImagePurpose,
): Promise<ImageIngestResult<ReencodedJpeg>> {
  let stored: ReencodedJpeg;
  try {
    stored = await reencodeJpeg(bytes);
  } catch (cause) {
    return refuse("undecodable", `the upload would not decode past its JPEG marker: ${String(cause)}`);
  }

  const { storedSize } = IMAGE_PURPOSES[purpose];
  const measured = `${stored.width} x ${stored.height}`;
  if (storedSize === "as-uploaded") {
    if (Math.max(stored.width, stored.height) > MAX_IMAGE_EDGE) {
      return refuse("tooBig", `the image decodes to ${measured}, past the ${MAX_IMAGE_EDGE} edge`);
    }
  } else if (stored.width !== storedSize.width || stored.height !== storedSize.height) {
    return refuse(
      "wrongSize",
      `the image decodes to ${measured}, not the ${storedSize.width} x ${storedSize.height} its purpose is stored at`,
    );
  }
  return { ok: true, value: stored };
}
