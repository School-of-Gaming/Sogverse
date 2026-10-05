import type { CatalogueImagePurpose } from "@/types";

/** Where a catalogue purpose's pictures live, and the one size they are stored at. */
export interface CatalogueImagePurposeSpec {
  /** The public storage bucket every entry of this purpose has its object in. */
  readonly bucket: string;
  /** The exact stored width in pixels: the crop draws to it and the routes demand it. */
  readonly width: number;
  /** The exact stored height in pixels. */
  readonly height: number;
}

/**
 * **The one map from a catalogue purpose to its bucket and its exact size.**
 * A row records only its purpose; everything that follows from the purpose is
 * read from here — the bucket a URL is built against and an object is removed
 * from, the crop dialog's output size, the size the upload routes refuse
 * anything else than, and the buckets `next.config.ts` lets the image
 * optimizer fetch from.
 *
 * The database stores no ratio or size, on purpose: if a crop changes, the
 * pictures cut for it are still that purpose's pictures, so the change is one
 * edit here and no row moves.
 *
 * Kept free of runtime imports so `next.config.ts` can read it.
 */
export const CATALOGUE_IMAGE_PURPOSES = {
  product: { bucket: "product-images", width: 1200, height: 800 },
  library_cover: { bucket: "library-covers", width: 1600, height: 900 },
  landing_image: { bucket: "landing-images", width: 1600, height: 900 },
} as const satisfies Record<CatalogueImagePurpose, CatalogueImagePurposeSpec>;
