import { z } from "zod";

/**
 * Wire contracts for the product image catalogue — the four admin routes and
 * the service that calls them. Both ends import from here: a route parses its
 * request body with the body schema, the service parses the route's response
 * with the response schema.
 *
 * The row schema is checked against the generated `ProductImage` type at its
 * use sites (the service's return types), so a column added to the table
 * without being added here fails to compile rather than silently disappearing.
 */

/**
 * The accepted upload types, keyed by the extension the object is stored
 * under. Nothing is re-encoded, so the extension a file arrives with is the
 * extension it is stored with — `jpeg` normalises to `jpg` and is the only
 * pair that collapses.
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
 * `resolveProductImageExtension` below; a CHECK on `product_images.path`
 * (migration 00198) requires the stored key to be `<sha256>.<ext>` with `ext`
 * drawn from this same set *minus* `jpeg`, which is accepted on upload and
 * normalised to `jpg` before anything is stored. The two must be widened in
 * one change: an extension this map accepts and the CHECK refuses is an upload
 * that fails after the bytes are already in the bucket.
 */
export const PRODUCT_IMAGE_MIME_BY_EXT: ReadonlyMap<string, string> = new Map([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["avif", "image/avif"],
  ["svg", "image/svg+xml"],
]);

/** Value for a file input's `accept`, derived from the map above. */
export const PRODUCT_IMAGE_ACCEPT = [...PRODUCT_IMAGE_MIME_BY_EXT.keys()]
  .map((ext) => `.${ext}`)
  .join(",");

export interface ProductImageExtension {
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
export function resolveProductImageExtension(
  rawExtension: string,
): ProductImageExtension | null {
  const raw = rawExtension.toLowerCase();
  const contentType = PRODUCT_IMAGE_MIME_BY_EXT.get(raw);
  if (contentType === undefined) return null;
  return { ext: raw === "jpeg" ? "jpg" : raw, contentType };
}

/**
 * The upload cap, checked on both sides. Vercel's function request bodies stop
 * at roughly 4.5 MB, so a larger file cannot reach the route at all — it fails
 * as a platform error with no message worth showing. The client checks the
 * size before posting so the admin gets the real reason; the route checks it
 * again because a route never trusts its caller.
 */
export const PRODUCT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/** Matches the table's `length(label) between 1 and 120` CHECK. */
export const PRODUCT_IMAGE_LABEL_MAX_LENGTH = 120;

/** What an admin may name an entry. The only mutable column. */
export const productImageLabel = z
  .string()
  .trim()
  .min(1, "A name is required")
  .max(
    PRODUCT_IMAGE_LABEL_MAX_LENGTH,
    `A name may be at most ${PRODUCT_IMAGE_LABEL_MAX_LENGTH} characters`,
  );

/** The label a catalogue entry falls back to when nothing else names it. */
export const PRODUCT_IMAGE_FALLBACK_LABEL = "Image";

/**
 * The codes the service attaches to the two upload refusals a caller can do
 * something about. Everything else surfaces the route's own admin-facing
 * English, which is already written to be read.
 */
export const PRODUCT_IMAGE_ERROR_CODES = {
  /** The file is over `PRODUCT_IMAGE_MAX_BYTES`. */
  tooLarge: "IMAGE_TOO_LARGE",
  /** The file's extension is outside `PRODUCT_IMAGE_MIME_BY_EXT`. */
  unsupportedType: "IMAGE_UNSUPPORTED_TYPE",
} as const;

export type ProductImageErrorCode =
  (typeof PRODUCT_IMAGE_ERROR_CODES)[keyof typeof PRODUCT_IMAGE_ERROR_CODES];

/** One catalogue entry, as every route returns it. */
export const productImageRow = z.object({
  id: z.string(),
  label: z.string(),
  sha256: z.string(),
  path: z.string(),
  created_at: z.string(),
});

/**
 * The upload outcome. `existing` is not a failure and not a warning: it is the
 * dedup mechanism answering, and the dialog selects the returned entry either
 * way. The two differ only in what the admin is told happened.
 */
export const uploadProductImageResponse = z.object({
  status: z.enum(["added", "existing"]),
  image: productImageRow,
});

export type UploadProductImageResult = z.infer<
  typeof uploadProductImageResponse
>;

/**
 * The replace outcome. `relinked` is how many products followed the repoint —
 * zero when the new bytes resolved to the entry being replaced, which is a
 * no-op rather than an error.
 */
export const replaceProductImageResponse = z.object({
  image: productImageRow,
  relinked: z.number().int().nonnegative(),
});

export type ReplaceProductImageResult = z.infer<
  typeof replaceProductImageResponse
>;

/** JSON body of `PATCH /api/admin/product-images/[id]`. */
export const renameProductImageBody = z.object({ label: productImageLabel });

export type RenameProductImageBody = z.infer<typeof renameProductImageBody>;

export const renameProductImageResponse = z.object({ image: productImageRow });

/** How many products lost their picture when the entry was deleted. */
export const deleteProductImageResponse = z.object({
  unlinked: z.number().int().nonnegative(),
});

export type DeleteProductImageResult = z.infer<
  typeof deleteProductImageResponse
>;
