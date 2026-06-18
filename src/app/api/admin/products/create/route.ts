import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { parseBodyValue } from "@/lib/api/json-body.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createProductData } from "@/services/products/products.contracts";
import type { Database } from "@/types";

type RpcArgs = Database["public"]["Functions"]["create_product"]["Args"];

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
      // RAISE EXCEPTION messages from our own RPCs are already friendly
      // ("Only admins can create products", "At least one translation is
      // required", etc.). Pass them through.
      return err.message;
  }
}

function resolveUploadMeta(
  file: File
): { path: string; contentType: string } | null {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const contentType = EXT_TO_MIME[ext];
  if (!contentType) return null;
  const normalised = ext === "jpeg" ? "jpg" : ext;
  return { path: `${randomUUID()}.${normalised}`, contentType };
}

export async function POST(request: Request) {
  const result = await requireRole("admin", {
    forbiddenMessage: "Only admins can create products",
  });
  if (result instanceof NextResponse) return result;
  const { supabase } = result;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Request must be multipart/form-data" },
      { status: 400 }
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
      { status: 400 }
    );
  }
  const body = parseBodyValue(raw, createProductData);
  if (body instanceof NextResponse) return body;

  const file = formData.get("file");
  const hasImage = file instanceof File;
  if (hasImage && file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "Image must be 5 MB or smaller" },
      { status: 413 }
    );
  }
  const uploadMeta = hasImage ? resolveUploadMeta(file) : null;
  if (hasImage && !uploadMeta) {
    return NextResponse.json(
      { error: "Unsupported file type. Use JPEG, PNG, WEBP, AVIF, or SVG." },
      { status: 415 }
    );
  }

  // Build RPC args. Nullable fields go in as undefined so the RPC uses its
  // DEFAULT NULL. Semantic validation beyond the contract schema's shapes
  // lives in the DB (CHECK constraints + location trigger on products).
  const rpcArgs: RpcArgs = {
    p_product_type: body.product_type,
    p_billing_mode: body.billing_mode,
    p_translations: body.translations,
    p_topic: body.topic,
    p_min_age: body.min_age,
    p_max_age: body.max_age,
    p_spoken_language_code: body.spoken_language_code,
    p_is_remote: body.is_remote,
    p_timezone: body.timezone,
    p_status: body.status,
    p_is_visible: body.is_visible,
    p_waitlist_enabled: body.waitlist_enabled,
    p_padlet_url: body.padlet_url ?? undefined,
    p_location_id: body.location_id ?? undefined,
    p_signup_threshold: body.signup_threshold ?? undefined,
    p_start_date: body.start_date ?? undefined,
    p_end_date: body.end_date ?? undefined,
    p_seat_count: body.seat_count ?? undefined,
    p_registration_opens_at: body.registration_opens_at,
    p_refund_policy_days: body.refund_policy_days ?? undefined,
    p_schedule_slots: body.schedule_slots,
    p_prices: body.prices,
    p_holiday_calendar_ids: body.holiday_calendar_ids,
  };

  // Call RPC through the user's session client — SECURITY INVOKER means
  // get_user_role() needs auth.uid() populated. RLS on each table gates the
  // inserts; the explicit admin check inside the RPC is belt-and-suspenders.
  const { data: productId, error: rpcError } = await supabase.rpc(
    "create_product",
    rpcArgs
  );

  if (rpcError) {
    // The form validates everything client-side, so RPC errors here are
    // mostly race conditions (an admin deleted a location / holiday calendar
    // between page load and submit). Translate Postgres native error
    // codes to actionable messages; RAISE EXCEPTION messages from our
    // own functions are already user-friendly and pass through.
    return NextResponse.json(
      { error: friendlyRpcError(rpcError) },
      { status: 400 }
    );
  }
  if (!productId) {
    return NextResponse.json(
      { error: "Failed to create product" },
      { status: 500 }
    );
  }

  // Image-last pattern: if the RPC succeeded but upload or path-update fails,
  // we return a soft warning. The product exists and is editable — admin can
  // retry the image on the edit page. No orphan-image cleanup needed.
  if (hasImage && uploadMeta) {
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("product-images")
      .upload(uploadMeta.path, file, {
        contentType: uploadMeta.contentType,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({
        product_id: productId,
        warning: `Product created but image upload failed: ${uploadError.message}. Retry from the edit page.`,
      });
    }

    const { error: updateError } = await supabase
      .from("products")
      .update({ image_path: uploadMeta.path })
      .eq("id", productId);

    if (updateError) {
      return NextResponse.json({
        product_id: productId,
        warning: `Product created and image uploaded but DB update failed: ${updateError.message}. Retry from the edit page.`,
      });
    }
  }

  return NextResponse.json({ product_id: productId });
}
