import { z } from "zod";
import { Constants, type CatalogueImagePurpose } from "@/types";
import { CATALOGUE_IMAGE_PURPOSES } from "@/lib/images/catalogue-image-purposes";

/**
 * Wire contracts for the image catalogue — the four admin routes and
 * the service that calls them. Both ends import from here: a route parses its
 * request body with the body schema, the service parses the route's response
 * with the response schema.
 *
 * The row schema is checked against the generated `CatalogueImage` type at its
 * use sites (the service's return types), so a column added to the table
 * without being added here fails to compile rather than silently disappearing.
 */

/**
 * The accepted upload types, keyed by the extension the object is stored
 * under. **JPEG only**: every upload is cropped in the browser to its
 * purpose's exact size, and the crop always comes out as a JPEG. `jpeg` normalises to
 * `jpg`.
 *
 * **A `Map`, not an object literal.** The key is a fragment of a filename the
 * caller chose, and an object literal answers `constructor`, `__proto__`,
 * `toString` and the rest of `Object.prototype` truthily — so a file named
 * `castle.constructor` would pass the accept-list gate and be uploaded with a
 * function where its content type belongs. A `Map` has no inherited keys, so
 * the question cannot arise.
 *
 * **This is the single definition of the accept list in application code — and
 * the database holds the other copy.** The routes reach it through
 * `resolveCatalogueImageExtension` below; a CHECK on `catalogue_images.path`
 * requires the stored key to be `<sha256>.<ext>`, and its extension list is a
 * superset of this one: it also admits `png`, `webp` and `avif`, the
 * extensions of entries uploaded before uploads were JPEG only. An extension
 * this map accepts and the CHECK refuses is an upload that fails after the
 * bytes are already in the bucket, so widening this map means widening the
 * CHECK in the same change.
 */
export const CATALOGUE_IMAGE_MIME_BY_EXT: ReadonlyMap<string, string> = new Map([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
]);

export interface CatalogueImageExtension {
  /** The canonical spelling an object is stored under — `jpeg` collapses to `jpg`. */
  ext: string;
  contentType: string;
}

/**
 * The stored extension and content type for one raw extension, or `null` when
 * it is outside the accept list. Callers pass the bare extension — whatever
 * they carved off a filename or an object key — and this decides whether it is
 * something we are willing to store, and under what type.
 */
export function resolveCatalogueImageExtension(
  rawExtension: string,
): CatalogueImageExtension | null {
  const raw = rawExtension.toLowerCase();
  const contentType = CATALOGUE_IMAGE_MIME_BY_EXT.get(raw);
  if (contentType === undefined) return null;
  return { ext: raw === "jpeg" ? "jpg" : raw, contentType };
}

/** A purpose as the upload form carries it. */
export const catalogueImagePurpose = z.enum(
  Constants.public.Enums.catalogue_image_purpose,
);

/**
 * Whether a picture is exactly the size its purpose is stored at — what the
 * upload routes require of every new upload and replacement. The size is read
 * from the one purpose map, beside the purpose's bucket.
 */
export function isPurposeSize(
  purpose: CatalogueImagePurpose,
  width: number,
  height: number,
): boolean {
  const size = CATALOGUE_IMAGE_PURPOSES[purpose];
  return width === size.width && height === size.height;
}

/**
 * The upload cap, checked on both sides. Vercel's function request bodies stop
 * at roughly 4.5 MB, so a larger file cannot reach the route at all — it fails
 * as a platform error with no message worth showing. The client checks the
 * size before posting so the admin gets the real reason; the route checks it
 * again because a route never trusts its caller.
 */
export const CATALOGUE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/** Matches the table's `length(label) between 1 and 120` CHECK. */
export const CATALOGUE_IMAGE_LABEL_MAX_LENGTH = 120;

/** What an admin may name an entry. The only mutable column. */
export const catalogueImageLabel = z
  .string()
  .trim()
  .min(1, "A name is required")
  .max(
    CATALOGUE_IMAGE_LABEL_MAX_LENGTH,
    `A name may be at most ${CATALOGUE_IMAGE_LABEL_MAX_LENGTH} characters`,
  );

/** The label a catalogue entry falls back to when nothing else names it. */
export const CATALOGUE_IMAGE_FALLBACK_LABEL = "Image";

/**
 * The codes carried by the upload refusals a caller can do something about.
 * Everything else surfaces the route's own admin-facing English, which is
 * already written to be read.
 */
export const CATALOGUE_IMAGE_ERROR_CODES = {
  /** The file is over `CATALOGUE_IMAGE_MAX_BYTES`. */
  tooLarge: "IMAGE_TOO_LARGE",
  /** The file is not a JPEG, by its extension or by its bytes. */
  unsupportedType: "IMAGE_UNSUPPORTED_TYPE",
  /** The picture is not exactly its purpose's size in `CATALOGUE_IMAGE_PURPOSES`. */
  wrongSize: "IMAGE_WRONG_SIZE",
} as const;

export type CatalogueImageErrorCode =
  (typeof CATALOGUE_IMAGE_ERROR_CODES)[keyof typeof CATALOGUE_IMAGE_ERROR_CODES];

/** One catalogue entry, as every route returns it. */
export const catalogueImageRow = z.object({
  id: z.string(),
  label: z.string(),
  sha256: z.string(),
  path: z.string(),
  purpose: catalogueImagePurpose,
  created_at: z.string(),
});

/**
 * The upload outcome. `existing` is not a failure and not a warning: it is the
 * dedup mechanism answering, and the dialog selects the returned entry either
 * way. The two differ only in what the admin is told happened.
 */
export const uploadCatalogueImageResponse = z.object({
  status: z.enum(["added", "existing"]),
  image: catalogueImageRow,
});

export type UploadCatalogueImageResult = z.infer<
  typeof uploadCatalogueImageResponse
>;

/**
 * The replace outcome. `relinked` is how many users followed the repoint —
 * products and Library articles together — and zero when the new bytes
 * resolved to the entry being replaced, which is a no-op rather than an error.
 */
export const replaceCatalogueImageResponse = z.object({
  image: catalogueImageRow,
  relinked: z.number().int().nonnegative(),
});

export type ReplaceCatalogueImageResult = z.infer<
  typeof replaceCatalogueImageResponse
>;

/** JSON body of `PATCH /api/admin/catalogue-images/[id]`. */
export const renameCatalogueImageBody = z.object({ label: catalogueImageLabel });

export type RenameCatalogueImageBody = z.infer<typeof renameCatalogueImageBody>;

export const renameCatalogueImageResponse = z.object({ image: catalogueImageRow });

/** How many users — products and Library articles — lost their picture when the entry was deleted. */
export const deleteCatalogueImageResponse = z.object({
  unlinked: z.number().int().nonnegative(),
});

export type DeleteCatalogueImageResult = z.infer<
  typeof deleteCatalogueImageResponse
>;
