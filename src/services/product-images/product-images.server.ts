import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api/api-error";
import type { AppSupabaseClient, ProductImage } from "@/types";
import {
  PRODUCT_IMAGE_FALLBACK_LABEL,
  PRODUCT_IMAGE_LABEL_MAX_LENGTH,
  PRODUCT_IMAGE_MAX_BYTES,
  resolveProductImageExtension,
} from "./product-images.contracts";
import type { ProductImageExtension } from "./product-images.contracts";

/**
 * The find-or-create half of the catalogue, shared by the upload route and the
 * replace route because they are the same operation with different callers.
 *
 * It takes both clients as arguments rather than constructing either: the
 * route-posture registry pins every file that reaches for the service-role
 * client, and a shared helper that constructed one would be an unpinned site.
 * The split is the same one the neighbouring product routes make — the bucket
 * has no policies so storage goes through the admin client, while the
 * catalogue table is governed by an admin-only RLS policy and is therefore
 * written on the caller's own session.
 */

/** The bucket the catalogue's objects live in. Public, unlisted, no policies. */
export const PRODUCT_IMAGE_BUCKET = "product-images";

/**
 * A year. Safe by construction here in a way it was not before: an object is
 * named by the sha256 of its bytes and uploaded with `upsert: false`, so the
 * bytes at a given URL can never change.
 */
const IMMUTABLE_CACHE_CONTROL = "31536000";

/** The columns every route returns for an entry. */
const ENTRY_COLUMNS = "id, label, sha256, path, created_at";

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
): ProductImageExtension | null {
  return resolveProductImageExtension(fileName.split(".").pop() ?? "");
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
    if (trimmed) return trimmed.slice(0, PRODUCT_IMAGE_LABEL_MAX_LENGTH);
  }
  return PRODUCT_IMAGE_FALLBACK_LABEL;
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
}

export interface FindOrCreateResult {
  status: "added" | "existing";
  image: ProductImage;
}

/**
 * Resolve a file's bytes to the one catalogue entry that holds them, creating
 * it if this is the first time we have seen them.
 *
 * The identity is the sha256 of the bytes, so uploading the same picture twice
 * yields the same object and the same row — that is the whole dedup mechanism,
 * and it is what lets a bucket URL promise immutable bytes.
 */
export async function findOrCreateProductImage({
  db,
  admin,
  file,
  ext,
  contentType,
  label,
}: FindOrCreateArgs): Promise<FindOrCreateResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const existing = await selectBySha(db, sha256);
  if (existing) return { status: "existing", image: existing };

  const path = `${sha256}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, file, {
      contentType,
      upsert: false,
      cacheControl: IMMUTABLE_CACHE_CONTROL,
    });

  if (uploadError && !isDuplicateObject(uploadError)) {
    console.error("[product-images] upload failed", uploadError);
    throw new ApiError(
      `The image could not be uploaded: ${uploadError.message}`,
      500,
    );
  }

  const { data: inserted, error: insertError } = await db
    .from("product_images")
    .insert({ label, sha256, path })
    .select(ENTRY_COLUMNS)
    .single();

  if (insertError) {
    // unique_violation — another request inserted this hash between the select
    // above and here. Its row is as good as the one we were about to write.
    if (insertError.code === "23505") {
      const raced = await selectBySha(db, sha256);
      if (raced) return { status: "existing", image: raced };
    }
    console.error("[product-images] entry insert failed", insertError);
    throw insertError;
  }

  return { status: "added", image: inserted };
}

async function selectBySha(
  db: AppSupabaseClient,
  sha256: string,
): Promise<ProductImage | null> {
  const { data, error } = await db
    .from("product_images")
    .select(ENTRY_COLUMNS)
    .eq("sha256", sha256)
    .maybeSingle();
  if (error) {
    console.error("[product-images] entry lookup failed", error);
    throw error;
  }
  return data;
}

export interface ImageUpload {
  file: File;
  label: string | null;
  ext: string;
  contentType: string;
}

/**
 * Pull the single `file` out of a multipart request, with the optional `label`
 * beside it. Returns the pieces, or the ready 400/413/415 the caller returns
 * unchanged — the same shape `parseJsonBody` uses for a JSON route.
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

  if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
    return NextResponse.json(
      { error: "Image must be 4 MB or smaller" },
      { status: 413 },
    );
  }

  const resolved = resolveImageExtension(file.name);
  if (!resolved) {
    return NextResponse.json(
      { error: "Unsupported file type. Use JPEG, PNG, WEBP, AVIF, or SVG." },
      { status: 415 },
    );
  }

  const labelField = formData.get("label");
  return {
    file,
    label: typeof labelField === "string" ? labelField : null,
    ext: resolved.ext,
    contentType: resolved.contentType,
  };
}
