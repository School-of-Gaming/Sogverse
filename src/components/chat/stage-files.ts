import {
  CHAT_IMAGE_JPEG_QUALITY,
  CHAT_IMAGE_MAX_EDGE,
} from "@/lib/constants/chat";
import { normalizeImage } from "@/lib/images/normalize-image";
import type { StagedChatImage } from "./composer-staging";

/**
 * Turning files a person handed the composer into staged pictures.
 *
 * **Staging IS the normalize pass, and that is what makes the preview, the
 * stored dimensions and the uploaded bytes one artifact.** The pick is decoded
 * once, downscaled under the edge cap and re-encoded as JPEG here; the
 * thumbnail draws that output, the row stores its dimensions, and the upload
 * sends its bytes. Staging the raw pick and encoding later would give the box a
 * different size from the picture that eventually arrives — a shift on data's
 * own schedule, in the one place the sender is watching — and would leave the
 * composer holding a file nobody had checked could be decoded at all.
 *
 * The same pass the session-photo composer runs, with the same numbers: one set
 * of image limits platform-wide. What it buys on the way is a smaller upload
 * (a 4K screenshot leaves the browser a few hundred KB, far under the
 * platform's request limit) and one format in the bucket.
 *
 * **It is the honest path's pre-shrink and not a guarantee of anything.** The
 * upload route re-encodes again server-side, because a modified client can
 * simply not run this — which is the whole reason the EXIF/GPS strip is stated
 * as a mechanism there rather than here.
 *
 * **A file the browser cannot open is refused at pick time**, not at send time.
 * Learning at Send that one of five files was never usable is the worst
 * available moment to be told.
 */
export async function readStagedChatImage(
  file: File,
): Promise<StagedChatImage | null> {
  if (!file.type.startsWith("image/")) return null;

  try {
    const normalized = await normalizeImage(file, {
      maxEdge: CHAT_IMAGE_MAX_EDGE,
      quality: CHAT_IMAGE_JPEG_QUALITY,
    });
    return {
      key: crypto.randomUUID(),
      // Minted from the ENCODED blob, so what is on screen is the picture that
      // will be sent rather than the file it came from.
      src: URL.createObjectURL(normalized.blob),
      file: normalized.blob,
      width: normalized.width,
      height: normalized.height,
      name: file.name,
    };
  } catch {
    // A decode or encode refusal — a corrupt file, or raw HEIC, which browsers
    // cannot decode. Nothing was minted, so there is nothing to revoke.
    return null;
  }
}

/** Every file that turned out to be a picture, in the order they were handed over. */
export async function readStagedChatImages(
  files: readonly File[],
): Promise<StagedChatImage[]> {
  const staged = await Promise.all(files.map(readStagedChatImage));
  return staged.filter((image): image is StagedChatImage => image !== null);
}
