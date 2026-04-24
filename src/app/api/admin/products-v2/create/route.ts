import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types";

type RpcArgs = Database["public"]["Functions"]["create_product_v2"]["Args"];

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

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
  // (CHECK constraints + location trigger on products_v2).
  const rpcArgs: RpcArgs = {
    p_product_type: body.product_type as RpcArgs["p_product_type"],
    p_billing_mode: body.billing_mode as RpcArgs["p_billing_mode"],
    p_name: body.name as string,
    p_description: body.description as string,
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
    p_registration_opens_at:
      (body.registration_opens_at as string | null) ?? undefined,
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
    "create_product_v2",
    rpcArgs
  );

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 400 });
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
      .from("products_v2")
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
