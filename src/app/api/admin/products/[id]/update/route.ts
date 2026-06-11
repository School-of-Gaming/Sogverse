import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { parseBodyValue } from "@/lib/api/json-body.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateProductData } from "@/services/products/products.contracts";
import type { Database } from "@/types";

type RpcArgs = Database["public"]["Functions"]["update_product"]["Args"];

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function friendlyRpcError(err: { code?: string; message: string }): string {
  switch (err.code) {
    case "23503": // foreign_key_violation
      return "Something you selected (location or holiday calendar) is no longer available. Please refresh the page and try again.";
    case "23505": // unique_violation
      return "A product with these details already exists. Please change something and try again.";
    default:
      return err.message;
  }
}

function resolveUploadMeta(
  file: File,
): { path: string; contentType: string } | null {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const contentType = EXT_TO_MIME[ext];
  if (!contentType) return null;
  const normalised = ext === "jpeg" ? "jpg" : ext;
  return { path: `${randomUUID()}.${normalised}`, contentType };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const result = await requireRole("admin", {
    forbiddenMessage: "Only admins can update products",
  });
  if (result instanceof NextResponse) return result;
  const { supabase } = result;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Request must be multipart/form-data" },
      { status: 400 },
    );
  }

  const dataField = formData.get("data");
  if (typeof dataField !== "string") {
    return NextResponse.json({ error: "Missing 'data' field" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(dataField);
  } catch {
    return NextResponse.json(
      { error: "'data' field must be valid JSON" },
      { status: 400 },
    );
  }
  const body = parseBodyValue(raw, updateProductData);
  if (body instanceof NextResponse) return body;

  const file = formData.get("file");
  const hasNewImage = file instanceof File;
  if (hasNewImage && file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "Image must be 5 MB or smaller" },
      { status: 413 },
    );
  }
  const uploadMeta = hasNewImage ? resolveUploadMeta(file) : null;
  if (hasNewImage && !uploadMeta) {
    return NextResponse.json(
      { error: "Unsupported file type. Use JPEG, PNG, WEBP, AVIF, or SVG." },
      { status: 415 },
    );
  }

  const clearImage = formData.get("clear_image") === "true";

  // Read existing image_path so we know what blob (if any) to delete on a
  // successful replace/clear. Doubles as a "does this product exist" check
  // before we bother uploading anything.
  const admin = createAdminClient();
  const { data: existing, error: readError } = await admin
    .from("products")
    .select("image_path")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 400 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  const existingPath = existing.image_path;

  // Upload the new blob FIRST so the RPC can commit image_path atomically
  // with the rest of the update. If the RPC then fails, we delete the
  // newly-uploaded blob to avoid an orphan in the bucket. Mirrors the
  // legacy update-product route.
  if (hasNewImage && uploadMeta) {
    const { error: uploadError } = await admin.storage
      .from("product-images")
      .upload(uploadMeta.path, file, {
        contentType: uploadMeta.contentType,
        upsert: false,
      });
    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message },
        { status: 500 },
      );
    }
  }

  // Final image_path to commit. We deliberately don't trust any path
  // string from the client — the existing path comes from the DB and the
  // new path comes from the just-uploaded blob.
  const finalImagePath: string | null = uploadMeta
    ? uploadMeta.path
    : clearImage
      ? null
      : existingPath;

  // p_image_path's DEFAULT is NULL, so omitting it (undefined) and passing
  // NULL produce the same effect — image_path is wiped. The cleared case
  // (finalImagePath === null) and the "no DEFAULT for a nullable string"
  // RpcArgs typing both land on undefined here.
  const rpcArgs: RpcArgs = {
    p_id: id,
    p_billing_mode: body.billing_mode,
    p_translations: body.translations,
    p_topic: body.topic,
    p_min_age: body.min_age,
    p_max_age: body.max_age,
    p_spoken_language_code: body.spoken_language_code,
    p_is_remote: body.is_remote,
    p_timezone: body.timezone,
    p_registration_opens_at: body.registration_opens_at,
    p_is_visible: body.is_visible,
    p_waitlist_enabled: body.waitlist_enabled,
    p_image_path: finalImagePath ?? undefined,
    p_padlet_url: body.padlet_url ?? undefined,
    p_location_id: body.location_id ?? undefined,
    p_signup_threshold: body.signup_threshold ?? undefined,
    p_start_date: body.start_date ?? undefined,
    p_end_date: body.end_date ?? undefined,
    p_seat_count: body.seat_count ?? undefined,
    p_refund_policy_days: body.refund_policy_days ?? undefined,
    p_schedule_slots: body.schedule_slots,
    p_prices: body.prices,
    p_holiday_calendar_ids: body.holiday_calendar_ids,
  };

  const { data: productId, error: rpcError } = await supabase.rpc(
    "update_product",
    rpcArgs,
  );

  if (rpcError) {
    if (uploadMeta) {
      await admin.storage.from("product-images").remove([uploadMeta.path]);
    }
    return NextResponse.json(
      { error: friendlyRpcError(rpcError) },
      { status: 400 },
    );
  }
  if (!productId) {
    if (uploadMeta) {
      await admin.storage.from("product-images").remove([uploadMeta.path]);
    }
    return NextResponse.json(
      { error: "Failed to update product" },
      { status: 500 },
    );
  }

  // Delete the old blob if its path is no longer referenced. Storage and
  // DB are separate systems, so this cleanup happens after the RPC
  // succeeds; if it fails we accept an orphan rather than rolling back
  // the (now-committed) DB update.
  if (existingPath && existingPath !== finalImagePath) {
    await admin.storage.from("product-images").remove([existingPath]);
  }

  return NextResponse.json({ product_id: productId });
}
