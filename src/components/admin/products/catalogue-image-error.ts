import { ApiError } from "@/lib/api/api-error";
import { CATALOGUE_IMAGE_ERROR_CODES } from "@/services/catalogue-images";

/** The refusals the catalogue translates; everything else is passed through. */
export type CatalogueImageErrorKey = "tooLarge" | "unsupportedType" | "wrongSize";

/**
 * What an admin is told when an upload, a replace, a rename or a removal is
 * refused.
 *
 * **The coded refusals are translated and the rest are shown verbatim**, and
 * the split is deliberate rather than lazy. Over the cap, not a JPEG and not
 * the purpose's exact size are things the admin can do something about, they
 * happen to whoever is holding the file rather than to the system, and the
 * sentence has to say what to do — so it belongs in the message catalogue like
 * any other piece of product copy. Everything else is the route's own
 * admin-facing English, which is already written to be read by an admin and is
 * more use in the exact words the server chose than translated into a
 * category.
 *
 * The refusals are recognised by the stable code the route sends, never by the
 * status alone: a 413 is the cap here and could be anything elsewhere.
 */
export function catalogueImageErrorMessage(
  error: unknown,
  t: (key: CatalogueImageErrorKey) => string,
): string {
  if (error instanceof ApiError) {
    if (error.code === CATALOGUE_IMAGE_ERROR_CODES.tooLarge) return t("tooLarge");
    if (error.code === CATALOGUE_IMAGE_ERROR_CODES.unsupportedType) {
      return t("unsupportedType");
    }
    if (error.code === CATALOGUE_IMAGE_ERROR_CODES.wrongSize) return t("wrongSize");
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
