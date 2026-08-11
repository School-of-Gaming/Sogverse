import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
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

/**
 * POST /api/admin/products/[id]/update — multipart, same shape as the create
 * route: a JSON `data` field beside an optional image `file`.
 *
 * No body schema is declared on the primitive, which is what leaves the request
 * stream untouched so this handler can read the form itself; the `data` field
 * is then validated through the same contract schema a JSON route would use.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can update products",
  params: z.object({ id: z.string().uuid() }),

  // Same shape as the create route: every database failure is turned into
  // admin-facing copy inside the handler, so the disclosure opt-in below only
  // ever forwards text written for an admin to read.
  discloseErrorMessages:
    "update_product's own RAISE messages are the admin-facing explanation of a refused update, and the product form shows them verbatim; the two native codes it can also raise are given written explanations first",

  handler: async ({ request, supabase, params }) => {
    const { id } = params;

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
      return NextResponse.json(
        { error: "Missing 'data' field" },
        { status: 400 },
      );
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
      console.error("[products/update] image_path read failed", readError);
      throw new ApiError("Could not read the product. Please try again.", 500);
    }
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const existingPath = existing.image_path;

    // Upload the new blob FIRST so the RPC can commit image_path atomically
    // with the rest of the update. If the RPC then fails, we delete the
    // newly-uploaded blob to avoid an orphan in the bucket.
    if (hasNewImage && uploadMeta) {
      const { error: uploadError } = await admin.storage
        .from("product-images")
        .upload(uploadMeta.path, file, {
          contentType: uploadMeta.contentType,
          upsert: false,
        });
      if (uploadError) {
        console.error("[products/update] image upload failed", uploadError);
        throw new ApiError(
          "The image could not be uploaded. Please try again.",
          500,
        );
      }
    }

    // Final image_path to commit. We deliberately don't trust any path string
    // from the client — the existing path comes from the DB and the new path
    // comes from the just-uploaded blob.
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
      // The RPC assigns every editable column on every call, so these two have
      // to arrive on an ordinary edit or the audience would be reset by it.
      // Non-defaulted parameters are what make that a compile error rather than
      // a silent one.
      p_for_gamers: body.for_gamers,
      p_for_parents: body.for_parents,
      // Omission is how a null age reaches the column (DEFAULT NULL); the
      // audience CHECK refuses it on a product that still has a gamer audience.
      p_min_age: body.min_age ?? undefined,
      p_max_age: body.max_age ?? undefined,
      p_spoken_language_code: body.spoken_language_code,
      p_is_remote: body.is_remote,
      p_timezone: body.timezone,
      p_registration_opens_at: body.registration_opens_at,
      p_is_visible: body.is_visible,
      p_waitlist_enabled: body.waitlist_enabled,
      p_image_path: finalImagePath ?? undefined,
      p_material_url: body.material_url ?? undefined,
      p_location_id: body.location_id ?? undefined,
      p_signup_threshold: body.signup_threshold ?? undefined,
      p_start_date: body.start_date ?? undefined,
      p_end_date: body.end_date ?? undefined,
      p_seat_count: body.seat_count ?? undefined,
      p_schedule_slots: body.schedule_slots,
      p_prices: body.prices,
      p_holiday_calendar_ids: body.holiday_calendar_ids,
      // null (unknown/none) maps to undefined so the RPC's DEFAULT NULL clears
      // the column; 0 (volunteer) survives `??` since it's not nullish.
      p_primary_gedu_fee_cents: body.primary_gedu_fee_cents ?? undefined,
      p_assistant_gedu_fee_cents: body.assistant_gedu_fee_cents ?? undefined,
      p_municipality_fee_cents: body.municipality_fee_cents ?? undefined,
    };

    const { data: productId, error: rpcError } = await supabase.rpc(
      "update_product",
      rpcArgs,
    );

    if (rpcError) {
      if (uploadMeta) {
        await admin.storage.from("product-images").remove([uploadMeta.path]);
      }
      throw new ApiError(friendlyRpcError(rpcError), 400);
    }
    if (!productId) {
      if (uploadMeta) {
        await admin.storage.from("product-images").remove([uploadMeta.path]);
      }
      throw new ApiError("Failed to update product", 500);
    }

    // Delete the old blob if its path is no longer referenced. Storage and DB
    // are separate systems, so this cleanup happens after the RPC succeeds; if
    // it fails we accept an orphan rather than rolling back the (now-committed)
    // DB update.
    if (existingPath && existingPath !== finalImagePath) {
      await admin.storage.from("product-images").remove([existingPath]);
    }

    return { product_id: productId };
  },
});
