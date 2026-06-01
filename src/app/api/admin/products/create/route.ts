import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
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
      return "Something you selected (topic, location, tag, or holiday calendar) is no longer available. Please refresh the page and try again.";
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

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(dataField) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "'data' field must be valid JSON" },
      { status: 400 }
    );
  }

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

  // Build RPC args. Values we don't have go in as undefined so the RPC uses
  // its DEFAULT NULL. Validation beyond "string is string" lives in the DB
  // (CHECK constraints + location trigger on products).
  const rpcArgs: RpcArgs = {
    p_product_type: body.product_type as RpcArgs["p_product_type"],
    p_billing_mode: body.billing_mode as RpcArgs["p_billing_mode"],
    p_translations: body.translations as RpcArgs["p_translations"],
    p_topic_id: body.topic_id as string,
    p_min_age: body.min_age as number,
    p_max_age: body.max_age as number,
    p_spoken_language_code: body.spoken_language_code as string,
    p_is_remote: body.is_remote as boolean,
    p_timezone: body.timezone as string,
    p_status: (body.status as RpcArgs["p_status"]) ?? undefined,
    p_is_visible: (body.is_visible as boolean | undefined) ?? undefined,
    p_waitlist_enabled:
      (body.waitlist_enabled as boolean | undefined) ?? undefined,
    p_padlet_url: (body.padlet_url as string | null) ?? undefined,
    p_location_id: (body.location_id as string | null) ?? undefined,
    p_signup_threshold: (body.signup_threshold as number | null) ?? undefined,
    p_start_date: (body.start_date as string | null) ?? undefined,
    p_end_date: (body.end_date as string | null) ?? undefined,
    p_seat_count: (body.seat_count as number | null) ?? undefined,
    p_registration_opens_at: body.registration_opens_at as string,
    p_refund_policy_days:
      (body.refund_policy_days as number | null) ?? undefined,
    p_schedule_slots: body.schedule_slots as RpcArgs["p_schedule_slots"],
    p_tag_ids: (body.tag_ids as string[] | undefined) ?? undefined,
    p_prices: body.prices as RpcArgs["p_prices"],
    p_holiday_calendar_ids:
      (body.holiday_calendar_ids as string[] | undefined) ?? undefined,
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
    // mostly race conditions (an admin deleted a topic / location / tag
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
