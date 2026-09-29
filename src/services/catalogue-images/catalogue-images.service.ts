import { walkPages } from "@/lib/supabase/paging";
import {
  parseJsonResponse,
  readApiError,
  readErrorMessage,
} from "@/lib/api/json-response";
import { ApiError } from "@/lib/api/api-error";
import { DEFAULT_LOCALE } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type {
  AppSupabaseClient,
  CatalogueImage,
  CatalogueImagePurpose,
  ProductType,
} from "@/types";
import {
  CATALOGUE_IMAGE_ERROR_CODES,
  CATALOGUE_IMAGE_MAX_BYTES,
  deleteCatalogueImageResponse,
  renameCatalogueImageResponse,
  replaceCatalogueImageResponse,
  uploadCatalogueImageResponse,
  type DeleteCatalogueImageResult,
  type ReplaceCatalogueImageResult,
  type UploadCatalogueImageResult,
} from "./catalogue-images.contracts";

/** One product linked to a catalogue entry, as the dialog lists it. */
export interface ProductPictureUser {
  kind: "product";
  id: string;
  name: string;
  product_type: ProductType;
  is_visible: boolean;
}

/** Anything a catalogue entry reaches. */
export type CatalogueImageUser = ProductPictureUser;

/**
 * Which products use which entry, keyed by entry id. The count a
 * tile's badge shows is the array's length — there is no separate counts map,
 * because two derivations of one number is how they come to disagree. An
 * entry nothing uses is absent from the record rather than present with an
 * empty array.
 */
export type CatalogueImageUsage = Record<string, CatalogueImageUser[]>;

/**
 * The image catalogue.
 *
 * Reads go through the injected client: `catalogue_images` is admin-only at the
 * database, so an admin's own session is all the authority a read needs and a
 * route would add nothing. Writes go through the API routes, because they
 * touch the storage buckets through the service-role client the browser must
 * never hold.
 */
export class CatalogueImagesService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * Every entry of one purpose, newest first. A surface only ever offers the
   * purpose it links, so the filter is part of the read rather than a step
   * after it.
   *
   * Walked rather than plainly selected: the table only grows — an entry is
   * removed only by an admin deliberately retiring a picture — so past
   * PostgREST's `max_rows` an unbounded read would quietly stop showing the
   * oldest images, and an image an admin cannot see is exactly what this
   * feature exists to prevent. `created_at` ties for two entries inserted in
   * the same transaction, hence the `id` tiebreaker.
   */
  async listImages(purpose: CatalogueImagePurpose): Promise<CatalogueImage[]> {
    return walkPages("listCatalogueImages", (from, to) =>
      this.supabase
        .from("catalogue_images")
        .select("id, label, sha256, path, purpose, created_at", {
          count: "exact",
        })
        .eq("purpose", purpose)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    );
  }

  /**
   * Which products each entry reaches, derived from a products read rather
   * than stored anywhere.
   *
   * Only imaged products are fetched: a product with no entry contributes to
   * no entry's list, so reading it would be payload for nothing. The name is
   * the default locale's, resolved the same way every other admin surface
   * resolves one — a product need not carry an English translation, and
   * filtering the embed to one locale would blank the name for those rather
   * than falling back.
   */
  async getUsage(): Promise<CatalogueImageUsage> {
    const productRows = await this.readProductUsage();

    const usage: CatalogueImageUsage = {};
    for (const row of productRows) {
      if (!row.image_id) continue;
      const translation = resolveTranslation(
        row.product_translations,
        DEFAULT_LOCALE,
      );
      (usage[row.image_id] ??= []).push({
        kind: "product",
        id: row.id,
        name: translation?.name.trim() ?? "",
        product_type: row.product_type,
        is_visible: row.is_visible,
      });
    }

    // A stable order inside each list, so re-reading usage after a rename or a
    // relink does not reshuffle a list the admin is reading.
    for (const users of Object.values(usage)) {
      users.sort(
        (a, b) =>
          userName(a).localeCompare(userName(b)) || a.id.localeCompare(b.id),
      );
    }

    return usage;
  }

  private readProductUsage() {
    return walkPages("catalogueImageUsage", (from, to) =>
      this.supabase
        .from("products")
        .select(
          "id, product_type, is_visible, image_id, product_translations(locale, name)",
          { count: "exact" },
        )
        .not("image_id", "is", null)
        // Embedded rows come back unordered, so the resolver's last fallback
        // ("first row present") would otherwise pick an arbitrary language for
        // a product carrying neither the default locale nor English.
        .order("locale", { referencedTable: "product_translations" })
        .order("id")
        .range(from, to),
    );
  }

  /**
   * Add a picture to the catalogue for `purpose`, or find the entry of that
   * purpose that already holds these exact bytes. `status` says which
   * happened; the caller selects the returned entry either way. `file` is a
   * JPEG already cropped to the purpose's exact size.
   */
  async uploadImage(
    file: File,
    purpose: CatalogueImagePurpose,
    label?: string,
  ): Promise<UploadCatalogueImageResult> {
    assertUploadableSize(file);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("purpose", purpose);
    if (label !== undefined) formData.append("label", label);

    const response = await fetch("/api/admin/catalogue-images", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) throw await uploadError(response, "Failed to add the image");

    return parseJsonResponse(response, uploadCatalogueImageResponse);
  }

  /**
   * Point every product using `id` at the entry holding the new bytes. The old entry stays in the catalogue,
   * unlinked, which is what makes this reversible. `relinked` is 0 when the
   * new bytes resolved to `id` itself.
   */
  async replaceImage(
    id: string,
    file: File,
  ): Promise<ReplaceCatalogueImageResult> {
    assertUploadableSize(file);

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(
      `/api/admin/catalogue-images/${encodeURIComponent(id)}/replace`,
      { method: "POST", body: formData },
    );
    if (!response.ok) {
      throw await uploadError(response, "Failed to replace the image");
    }

    return parseJsonResponse(response, replaceCatalogueImageResponse);
  }

  /** Rename an entry. The label is the only mutable thing about one. */
  async renameImage(id: string, label: string): Promise<CatalogueImage> {
    const response = await fetch(
      `/api/admin/catalogue-images/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      },
    );
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to rename the image"),
      );
    }

    const { image } = await parseJsonResponse(
      response,
      renameCatalogueImageResponse,
    );
    return image;
  }

  /**
   * Remove an entry from the catalogue: the row and its object both go, and
   * every product linked to it is left with no picture. `unlinked` is how many
   * that was.
   */
  async deleteImage(id: string): Promise<DeleteCatalogueImageResult> {
    const response = await fetch(
      `/api/admin/catalogue-images/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to remove the image"),
      );
    }

    return parseJsonResponse(response, deleteCatalogueImageResponse);
  }
}

/** What a usage list is sorted by: a product's name. */
function userName(user: CatalogueImageUser): string {
  return user.name;
}

/**
 * The size check happens here, before the request is built, because a body
 * over Vercel's limit never reaches the route: the platform refuses it and the
 * admin would see a network failure instead of the one sentence that tells
 * them what to do about it.
 */
function assertUploadableSize(file: File): void {
  if (file.size > CATALOGUE_IMAGE_MAX_BYTES) {
    throw new ApiError(
      `Image must be ${CATALOGUE_IMAGE_MAX_BYTES / (1024 * 1024)} MB or smaller`,
      413,
      CATALOGUE_IMAGE_ERROR_CODES.tooLarge,
    );
  }
}

/**
 * Turn a refused upload into an error the caller can act on. The refusals an
 * admin can do something about carry a stable code the UI translates; every
 * other failure surfaces the route's own admin-facing English, which is
 * already written to be read.
 *
 * The code comes from the route's body. A 413 whose body is not ours is the
 * platform refusing the request before the route saw it, and it is the same
 * refusal, so it gets the same code.
 */
async function uploadError(
  response: Response,
  fallback: string,
): Promise<ApiError> {
  const error = await readApiError(response, fallback);
  if (error.code === undefined && response.status === 413) {
    return new ApiError(
      error.message,
      response.status,
      CATALOGUE_IMAGE_ERROR_CODES.tooLarge,
    );
  }
  return error;
}
