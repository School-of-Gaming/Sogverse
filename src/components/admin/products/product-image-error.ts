import { ApiError } from "@/lib/api/api-error";
import { PRODUCT_IMAGE_ERROR_CODES } from "@/services/product-images";

/** The two refusals the catalogue translates; everything else is passed through. */
export type ProductImageErrorKey = "tooLarge" | "unsupportedType";

/**
 * What an admin is told when an upload, a replace, a rename or a removal is
 * refused.
 *
 * **Two refusals are translated and the rest are shown verbatim**, and the
 * split is deliberate rather than lazy. Over-the-cap and wrong-file-type are
 * things the admin can do something about, they happen to whoever is holding
 * the file rather than to the system, and the sentence has to say the number
 * and the list — so it belongs in the message catalogue like any other piece of
 * product copy. Everything else is the route's own admin-facing English, which
 * is already written to be read by an admin and is more use in the exact words
 * the server chose than translated into a category.
 *
 * The two are recognised by the stable code the service attaches, never by the
 * status alone: a 413 is the cap here and could be anything elsewhere.
 */
export function productImageErrorMessage(
  error: unknown,
  t: (key: ProductImageErrorKey) => string,
): string {
  if (error instanceof ApiError) {
    if (error.code === PRODUCT_IMAGE_ERROR_CODES.tooLarge) return t("tooLarge");
    if (error.code === PRODUCT_IMAGE_ERROR_CODES.unsupportedType) {
      return t("unsupportedType");
    }
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
