/**
 * The address and declared size of a stored catalogue picture as a link
 * preview meets it: not the bucket object itself but its rendition through the
 * picture route (`src/app/opengraph-images/picture/`), downscaled to preview
 * width and encoded under the preview byte budget.
 *
 * **Why not the bucket URL.** A product picture or a Library cover is stored at
 * full size, and some older product pictures are PNGs of a couple of
 * megabytes. WhatsApp drops any preview image past roughly 300 KB without a
 * word, so a page whose `og:image` is the stored object shares as a link with
 * no picture. The route serves the same picture inside the budget, so a page
 * names it here and never builds the bucket URL into its card.
 *
 * **Why the size can be declared.** Every catalogue purpose is stored at one
 * exact size (`CATALOGUE_IMAGE_PURPOSES`), and the route only ever narrows it
 * to `PREVIEW_IMAGE_MAX_WIDTH`, keeping its shape. So the rendition's pixel
 * size is known before it is fetched, and a consumer that trusts
 * `og:image:width`/`height` can reserve the right frame.
 *
 * Builds strings and numbers only, so any metadata builder can import it.
 */

import type { CatalogueImagePurpose } from "@/types";
import { CATALOGUE_IMAGE_PURPOSES } from "@/lib/images/catalogue-image-purposes";
import { PREVIEW_IMAGE_MAX_WIDTH } from "@/lib/images/preview-budget";

/**
 * The shape of every catalogue object key: the lowercase hex sha256 of its
 * bytes and an extension the catalogue's `path` CHECK allows. The route answers
 * nothing else, before it reaches storage.
 */
export const CATALOGUE_OBJECT_KEY = /^[0-9a-f]{64}\.(jpg|png|webp|avif)$/;

/**
 * The picture route's path for one stored picture. Relative, so it resolves
 * against the root layout's `metadataBase` like every other card URL.
 */
export function ogPicturePath(purpose: CatalogueImagePurpose, path: string): string {
  return `/opengraph-images/picture/${purpose}/${path}`;
}

/**
 * The size the route serves a purpose's pictures at: the stored size, narrowed
 * to preview width with its aspect kept and never enlarged, the height rounded
 * as sharp rounds it when it resizes to a width.
 */
function previewSizeOf(purpose: CatalogueImagePurpose): { width: number; height: number } {
  const { width, height } = CATALOGUE_IMAGE_PURPOSES[purpose];
  if (width <= PREVIEW_IMAGE_MAX_WIDTH) return { width, height };
  return {
    width: PREVIEW_IMAGE_MAX_WIDTH,
    height: Math.round((height * PREVIEW_IMAGE_MAX_WIDTH) / width),
  };
}

/** One stored picture as an Open Graph / Twitter image entry. */
export function ogPictureImage(
  purpose: CatalogueImagePurpose,
  path: string,
  alt: string,
): { url: string; alt: string; width: number; height: number } {
  return { url: ogPicturePath(purpose, path), alt, ...previewSizeOf(purpose) };
}
