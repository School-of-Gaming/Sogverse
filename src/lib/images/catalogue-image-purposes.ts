import type { CatalogueImagePurpose } from "@/types";
import { IMAGE_PURPOSES, type ImagePurpose } from "./image-purposes";

/** Where a catalogue purpose's pictures live, and the one size they are stored at. */
export interface CatalogueImagePurposeSpec {
  /** The public storage bucket every entry of this purpose has its object in. */
  readonly bucket: string;
  /** The exact stored width in pixels: the crop draws to it and the routes demand it. */
  readonly width: number;
  /** The exact stored height in pixels. */
  readonly height: number;
}

/** The registry's purposes whose pictures are catalogue entries. */
type RegistryCataloguePurpose = {
  [P in ImagePurpose]: (typeof IMAGE_PURPOSES)[P]["catalogue"] extends true ? P : never;
}[ImagePurpose];

/** `true` exactly when the two unions have the same members. */
type SameMembers<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * **The registry's catalogue purposes and the database enum are one set.**
 *
 * A row's purpose is the `catalogue_image_purpose` enum, and the bucket and
 * size that purpose implies are read from the registry. If the enum gains a
 * member the registry does not mark catalogue, a row could name a purpose
 * nothing knows how to store; if the registry marks a purpose catalogue that
 * the enum lacks, no row could ever carry it. Either drift turns this
 * conditional type `false`, and the `true` assigned to it stops type-checking.
 */
const CATALOGUE_PURPOSES_MATCH_THE_ENUM: SameMembers<
  RegistryCataloguePurpose,
  CatalogueImagePurpose
> = true;
void CATALOGUE_PURPOSES_MATCH_THE_ENUM;

/**
 * One catalogue purpose's bucket and size, read from the registry. Reading the
 * size's width and height here is what refuses a catalogue purpose stored as
 * uploaded: the catalogue's crop draws to an exact size and its upload routes
 * refuse anything else, so such a purpose stops this from type-checking.
 */
function cataloguePurposeSpec(purpose: CatalogueImagePurpose): CatalogueImagePurposeSpec {
  const { bucket, storedSize } = IMAGE_PURPOSES[purpose];
  return { bucket, width: storedSize.width, height: storedSize.height };
}

/**
 * **The one map from a catalogue purpose to its bucket and its exact size.**
 * A row records only its purpose; everything that follows from the purpose is
 * read from here — the bucket a URL is built against and an object is removed
 * from, the crop dialog's output size, the size the upload routes refuse
 * anything else than, and the buckets `next.config.ts` lets the image
 * optimizer fetch from.
 *
 * The figures are declared in the image purpose registry (`image-purposes.ts`),
 * which names every storage bucket; this is the catalogue's view of it, keyed
 * by the database enum so no consumer has to narrow a registry purpose itself.
 *
 * The database stores no ratio or size, on purpose: if a crop changes, the
 * pictures cut for it are still that purpose's pictures, so the change is one
 * edit in the registry and no row moves.
 *
 * Kept free of runtime imports beyond the registry, which has none, so
 * `next.config.ts` can read it.
 */
export const CATALOGUE_IMAGE_PURPOSES = {
  product: cataloguePurposeSpec("product"),
  library_cover: cataloguePurposeSpec("library_cover"),
  landing_image: cataloguePurposeSpec("landing_image"),
  landing_square_image: cataloguePurposeSpec("landing_square_image"),
  landing_portrait_image: cataloguePurposeSpec("landing_portrait_image"),
  spotlight_image: cataloguePurposeSpec("spotlight_image"),
} as const satisfies Record<CatalogueImagePurpose, CatalogueImagePurposeSpec>;

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/**
 * A catalogue purpose's shape as a ratio in lowest terms, read off its stored
 * size: `16:9` for a 1600 × 900 purpose. What an admin is told a picture of
 * that purpose has to be.
 */
export function cataloguePurposeRatio(purpose: CatalogueImagePurpose): string {
  const { width, height } = CATALOGUE_IMAGE_PURPOSES[purpose];
  const divisor = greatestCommonDivisor(width, height);
  return `${width / divisor}:${height / divisor}`;
}
