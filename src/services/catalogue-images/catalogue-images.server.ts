import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { ApiError } from "@/lib/api/api-error";
import { CATALOGUE_IMAGE_PURPOSES } from "@/lib/images/catalogue-image-purposes";
import type {
  AppSupabaseClient,
  CatalogueImage,
  CatalogueImagePurpose,
} from "@/types";
import {
  CATALOGUE_IMAGE_ERROR_CODES,
  CATALOGUE_IMAGE_FALLBACK_LABEL,
  CATALOGUE_IMAGE_LABEL_MAX_LENGTH,
  CATALOGUE_IMAGE_MAX_BYTES,
  catalogueImagePurpose,
  isPurposeSize,
  resolveCatalogueImageExtension,
} from "./catalogue-images.contracts";
import type {
  CatalogueImageErrorCode,
  CatalogueImageExtension,
} from "./catalogue-images.contracts";

/**
 * The find-or-create half of the catalogue, shared by the upload route and the
 * replace route because they are the same operation with different callers.
 *
 * It takes both clients as arguments rather than constructing either: the
 * route-posture registry pins every file that reaches for the service-role
 * client, and a shared helper that constructed one would be an unpinned site.
 * The split is the same one the neighbouring product routes make — storage
 * goes through the admin client, the one writer the routes keep the buckets'
 * guarantees behind, while the catalogue table is governed by an admin-only
 * RLS policy and is therefore written on the caller's own session. Which
 * bucket is the entry's purpose's, from `CATALOGUE_IMAGE_PURPOSES`.
 */

/**
 * A year. Safe by construction here in a way it was not before: an object is
 * named by the sha256 of its bytes and uploaded with `upsert: false`, so the
 * bytes at a given URL can never change.
 */
const IMMUTABLE_CACHE_CONTROL = "31536000";

/** The columns every route returns for an entry. */
const ENTRY_COLUMNS = "id, label, sha256, path, purpose, created_at";

/**
 * The stored extension for an upload, or null when the type is outside the
 * accept list. `jpeg` normalises to `jpg`; nothing else collapses.
 *
 * The lookup itself lives in the contracts module and is backed by a `Map`, so
 * an upload named `castle.constructor` or `castle.__proto__` is refused here
 * rather than inheriting an answer from `Object.prototype`.
 */
export function resolveImageExtension(
  fileName: string,
): CatalogueImageExtension | null {
  return resolveCatalogueImageExtension(fileName.split(".").pop() ?? "");
}

/**
 * What a new entry is called: the label the caller supplied, else the upload
 * filename's stem, else a bare fallback. Trimmed and capped rather than
 * refused — a name is a convenience an admin can fix inline, and refusing an
 * upload over one would throw away the bytes for a cosmetic reason. The rename
 * route, where the label *is* the request, validates strictly instead.
 */
export function resolveEntryLabel(
  provided: string | null,
  fileName: string,
): string {
  const candidates = [provided ?? "", fileName.replace(/\.[^.]+$/, "")];
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed) return trimmed.slice(0, CATALOGUE_IMAGE_LABEL_MAX_LENGTH);
  }
  return CATALOGUE_IMAGE_FALLBACK_LABEL;
}

/**
 * Storage's answer when the object already exists. Hash-named objects make
 * that success rather than a conflict: the bytes at that key are, by
 * construction, the bytes we were about to write. It happens legitimately —
 * an object that survived a failed removal, or two admins uploading the same
 * picture at once.
 */
function isDuplicateObject(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("statusCode" in error && String(error.statusCode) === "409") return true;
  return (
    "message" in error &&
    typeof error.message === "string" &&
    /already exists|duplicate/i.test(error.message)
  );
}

export interface FindOrCreateArgs {
  /** The caller's own session client — admin-gated by RLS on the table. */
  db: AppSupabaseClient;
  /** The service-role client, used for the bucket and nothing else. */
  admin: AppSupabaseClient;
  file: File;
  /** From `resolveImageExtension`, so the route can answer 415 before this. */
  ext: string;
  contentType: string;
  /** The label to give a new entry. Ignored when one already holds the bytes. */
  label: string;
  /**
   * The purpose the bytes were measured against by `refuseUnlessPurposeSize`,
   * which decides the bucket they go to and the entry they resolve to.
   */
  purpose: CatalogueImagePurpose;
}

export interface FindOrCreateResult {
  status: "added" | "existing";
  image: CatalogueImage;
}

/**
 * Resolve a file's bytes to the one catalogue entry of this purpose that holds
 * them, creating it if this is the first time the purpose has seen them.
 *
 * The identity is the purpose and the sha256 of the bytes, so uploading the
 * same picture twice for one purpose yields the same object and the same row —
 * that is the whole dedup mechanism, and it is what lets a bucket URL promise
 * immutable bytes. The same bytes uploaded for another purpose are another
 * object in that purpose's bucket, and another row: each bucket is its own
 * namespace, and the table's uniqueness is per purpose to match.
 */
export async function findOrCreateCatalogueImage({
  db,
  admin,
  file,
  ext,
  contentType,
  label,
  purpose,
}: FindOrCreateArgs): Promise<FindOrCreateResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const existing = await selectBySha(db, purpose, sha256);
  if (existing) return { status: "existing", image: existing };

  const path = `${sha256}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from(CATALOGUE_IMAGE_PURPOSES[purpose].bucket)
    .upload(path, file, {
      contentType,
      upsert: false,
      cacheControl: IMMUTABLE_CACHE_CONTROL,
    });

  if (uploadError && !isDuplicateObject(uploadError)) {
    console.error("[catalogue-images] upload failed", uploadError);
    throw new ApiError(
      `The image could not be uploaded: ${uploadError.message}`,
      500,
    );
  }

  const { data: inserted, error: insertError } = await db
    .from("catalogue_images")
    .insert({ label, sha256, path, purpose })
    .select(ENTRY_COLUMNS)
    .single();

  if (insertError) {
    // unique_violation — another request inserted this hash for this purpose
    // between the select above and here. Its row is as good as the one we were
    // about to write.
    if (insertError.code === "23505") {
      const raced = await selectBySha(db, purpose, sha256);
      if (raced) return { status: "existing", image: raced };
    }
    console.error("[catalogue-images] entry insert failed", insertError);
    throw insertError;
  }

  return { status: "added", image: inserted };
}

async function selectBySha(
  db: AppSupabaseClient,
  purpose: CatalogueImagePurpose,
  sha256: string,
): Promise<CatalogueImage | null> {
  const { data, error } = await db
    .from("catalogue_images")
    .select(ENTRY_COLUMNS)
    .eq("purpose", purpose)
    .eq("sha256", sha256)
    .maybeSingle();
  if (error) {
    console.error("[catalogue-images] entry lookup failed", error);
    throw error;
  }
  return data;
}

export interface ImageUpload {
  file: File;
  label: string | null;
  /** The form's `purpose` field, or null when it carried none. */
  purpose: CatalogueImagePurpose | null;
  ext: string;
  contentType: string;
}

/**
 * Pull the single `file` out of a multipart request, with the optional `label`
 * and `purpose` beside it. Returns the pieces, or the ready 400/413/415 the
 * caller returns unchanged — the same shape `parseJsonBody` uses for a JSON
 * route.
 */
export async function readImageUpload(
  request: Request,
): Promise<ImageUpload | NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Request must be multipart/form-data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
  }

  const overCap = sizeCapRefusal(file.size);
  if (overCap) return refusalResponse(overCap);

  const resolved = resolveImageExtension(file.name);
  if (!resolved) return refusalResponse(UNSUPPORTED_TYPE);

  const purposeField = formData.get("purpose");
  let purpose: CatalogueImagePurpose | null = null;
  if (purposeField !== null) {
    const parsed = catalogueImagePurpose.safeParse(purposeField);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: `'purpose' must be one of ${catalogueImagePurpose.options.join(", ")}`,
        },
        { status: 400 },
      );
    }
    purpose = parsed.data;
  }

  const labelField = formData.get("label");
  return {
    file,
    label: typeof labelField === "string" ? labelField : null,
    purpose,
    ext: resolved.ext,
    contentType: resolved.contentType,
  };
}

/**
 * An upload refused for a reason the admin can act on: the HTTP status the
 * routes answer with, the sentence, and the stable code the catalogue dialog
 * translates. Plain data rather than a response, so a writer that is not a
 * route — the MCP uploader tool — refuses with the same sentence.
 */
export interface UploadRefusal {
  status: 413 | 415 | 422;
  error: string;
  code: CatalogueImageErrorCode;
}

/** A refusal as the routes answer it. */
export function refusalResponse({ status, error, code }: UploadRefusal): NextResponse {
  return NextResponse.json({ error, code }, { status });
}

const UNSUPPORTED_TYPE: UploadRefusal = {
  status: 415,
  error: "Unsupported file type. Use a JPEG.",
  code: CATALOGUE_IMAGE_ERROR_CODES.unsupportedType,
};

/** The 4 MB cap, or null when `bytes` is within it. */
export function sizeCapRefusal(bytes: number): UploadRefusal | null {
  if (bytes <= CATALOGUE_IMAGE_MAX_BYTES) return null;
  return {
    status: 413,
    error: "Image must be 4 MB or smaller",
    code: CATALOGUE_IMAGE_ERROR_CODES.tooLarge,
  };
}

/**
 * Every check a new picture passes before it is stored, in the order the
 * upload route makes them: the size cap, a JPEG name, and a JPEG exactly the
 * purpose's size measured from the bytes. Answers the stored extension and
 * content type, or the first refusal.
 */
export async function vetCatalogueUpload(
  file: File,
  purpose: CatalogueImagePurpose,
): Promise<UploadRefusal | CatalogueImageExtension> {
  const overCap = sizeCapRefusal(file.size);
  if (overCap) return overCap;
  const resolved = resolveImageExtension(file.name);
  if (!resolved) return UNSUPPORTED_TYPE;
  const wrongSize = await purposeSizeRefusal(file, purpose);
  if (wrongSize) return wrongSize;
  return resolved;
}

/**
 * The largest picture whose header this will accept, in pixels. Far above
 * any purpose's size; it only keeps a hostile header from being taken at its
 * word.
 */
const MAX_INPUT_PIXELS = 4096 * 4096;

/** How the size refusal names each purpose to the admin reading it. */
const PURPOSE_NAME: Record<CatalogueImagePurpose, string> = {
  product: "product picture",
  library_cover: "Library cover",
};

/**
 * Refuse an upload that is not a JPEG exactly the size its purpose is stored
 * at, or answer null when it is. The size is measured from the bytes, never
 * taken from the request: the routes and the MCP uploader are the only
 * writers to the bucket, so this is the one place the guarantee can be kept,
 * and the database cannot keep it because it never sees the bytes.
 *
 * The size is the one the picture is *shown* at, so an orientation tag that
 * turns it a quarter swaps the two. The crop dialog writes no tag at all.
 */
export async function purposeSizeRefusal(
  file: File,
  purpose: CatalogueImagePurpose,
): Promise<UploadRefusal | null> {
  let width: number;
  let height: number;
  try {
    const metadata = await sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
    if (metadata.format !== "jpeg") return UNSUPPORTED_TYPE;
    const quarterTurn = (metadata.orientation ?? 1) >= 5;
    width = quarterTurn ? metadata.height : metadata.width;
    height = quarterTurn ? metadata.width : metadata.height;
  } catch {
    // Nothing sharp can read a header from: whatever its name says, it is not
    // a JPEG.
    return UNSUPPORTED_TYPE;
  }

  if (isPurposeSize(purpose, width, height)) return null;

  const size = CATALOGUE_IMAGE_PURPOSES[purpose];
  return {
    status: 422,
    error: `A ${PURPOSE_NAME[purpose]} must be exactly ${size.width} × ${size.height} pixels; this one is ${width} × ${height}`,
    code: CATALOGUE_IMAGE_ERROR_CODES.wrongSize,
  };
}

/** `purposeSizeRefusal` as the routes answer it. */
export async function refuseUnlessPurposeSize(
  file: File,
  purpose: CatalogueImagePurpose,
): Promise<NextResponse | null> {
  const refused = await purposeSizeRefusal(file, purpose);
  return refused && refusalResponse(refused);
}
