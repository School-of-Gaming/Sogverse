import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProductUpdate } from "@/types";

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const UPDATABLE_FIELDS = [
  "name",
  "description",
  "padlet_url",
  "game_id",
  "day_of_week",
  "start_time",
  "duration_minutes",
  "min_age",
  "max_age",
  "is_remote",
  "location_id",
  "spoken_language_code",
  "is_visible",
] as const;

function resolveUploadMeta(file: File): { path: string; contentType: string } | null {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const contentType = EXT_TO_MIME[ext];
  if (!contentType) return null;
  const normalised = ext === "jpeg" ? "jpg" : ext;
  return { path: `${randomUUID()}.${normalised}`, contentType };
}

export async function POST(request: Request) {
  try {
    const result = await requireRole("admin", {
      forbiddenMessage: "Only admins can update products",
    });
    if (result instanceof NextResponse) return result;

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Request must be multipart/form-data" },
        { status: 400 }
      );
    }

    const id = formData.get("id");
    if (typeof id !== "string" || !id) {
      return NextResponse.json(
        { error: "Product id is required" },
        { status: 400 }
      );
    }

    const dataField = formData.get("data");
    if (typeof dataField !== "string") {
      return NextResponse.json(
        { error: "Missing 'data' field" },
        { status: 400 }
      );
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

    // Optional file — only present when the admin is replacing the image.
    let uploadMeta: { path: string; contentType: string } | null = null;
    const file = formData.get("file");
    if (file instanceof File) {
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: "Image must be 5 MB or smaller" },
          { status: 413 }
        );
      }
      uploadMeta = resolveUploadMeta(file);
      if (!uploadMeta) {
        return NextResponse.json(
          { error: "Unsupported file type. Use JPEG, PNG, WEBP, AVIF, or SVG." },
          { status: 415 }
        );
      }
    }

    const updates: Partial<ProductUpdate> = {};
    for (const field of UPDATABLE_FIELDS) {
      if (field in body) {
        (updates as Record<string, unknown>)[field] = body[field];
      }
    }

    if (
      typeof updates.padlet_url === "string" &&
      updates.padlet_url.trim() === ""
    ) {
      updates.padlet_url = null;
    }
    if (typeof updates.padlet_url === "string") {
      try {
        new URL(updates.padlet_url);
      } catch {
        return NextResponse.json(
          { error: "Padlet URL must be a valid URL" },
          { status: 400 }
        );
      }
    }

    if (
      "is_remote" in updates &&
      "location_id" in updates &&
      updates.is_remote === true &&
      updates.location_id !== null
    ) {
      return NextResponse.json(
        { error: "Remote products cannot have a location" },
        { status: 400 }
      );
    }
    if (
      "is_remote" in updates &&
      "location_id" in updates &&
      updates.is_remote === false &&
      !updates.location_id
    ) {
      return NextResponse.json(
        { error: "In-person products must have a location" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    if (typeof updates.location_id === "string" && updates.location_id) {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          updates.location_id
        )
      ) {
        return NextResponse.json(
          { error: "location_id must be a UUID" },
          { status: 400 }
        );
      }
      const { data: locationRow, error: locationError } = await admin
        .from("locations")
        .select("type")
        .eq("id", updates.location_id)
        .maybeSingle();
      if (locationError) {
        return NextResponse.json({ error: locationError.message }, { status: 400 });
      }
      if (!locationRow) {
        return NextResponse.json(
          { error: "location_id does not reference an existing location" },
          { status: 400 }
        );
      }
      if (locationRow.type !== "site") {
        return NextResponse.json(
          { error: "location_id must point at a site (leaf)" },
          { status: 400 }
        );
      }
    }

    // Read the existing image_path so we can delete it after a successful
    // replace. Also doubles as an existence check before we bother uploading.
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

    // If a new file was provided, upload it before the DB update so the
    // update can include image_path in one atomic write. On update failure we
    // remove the newly-uploaded object; on success we remove the old one.
    if (uploadMeta && file instanceof File) {
      const { error: uploadError } = await admin.storage
        .from("product-images")
        .upload(uploadMeta.path, file, {
          contentType: uploadMeta.contentType,
          upsert: false,
        });
      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }
      updates.image_path = uploadMeta.path;
    }

    const { data, error } = await admin
      .from("products")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (uploadMeta) {
        await admin.storage.from("product-images").remove([uploadMeta.path]);
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (
      uploadMeta &&
      existing.image_path &&
      existing.image_path !== uploadMeta.path
    ) {
      await admin.storage
        .from("product-images")
        .remove([existing.image_path]);
    }

    return NextResponse.json({ product: data });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
