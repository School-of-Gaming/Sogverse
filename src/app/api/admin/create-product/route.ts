import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

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
      forbiddenMessage: "Only admins can create products",
    });
    if (result instanceof NextResponse) return result;
    const { user } = result;

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

    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Image file is required" },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Image must be 5 MB or smaller" },
        { status: 413 }
      );
    }
    const uploadMeta = resolveUploadMeta(file);
    if (!uploadMeta) {
      return NextResponse.json(
        { error: "Unsupported file type. Use JPEG, PNG, WEBP, AVIF, or SVG." },
        { status: 415 }
      );
    }

    // Validate required fields
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const tokenCost = typeof body.token_cost === "number" ? body.token_cost : NaN;
    const gameId = typeof body.game_id === "string" ? body.game_id : "";
    const dayOfWeek =
      typeof body.day_of_week === "number" ? body.day_of_week : -1;
    const startTime =
      typeof body.start_time === "string" ? body.start_time : "";
    const durationMinutes =
      typeof body.duration_minutes === "number" ? body.duration_minutes : 0;
    const minAge = typeof body.min_age === "number" ? body.min_age : -1;
    const maxAge = typeof body.max_age === "number" ? body.max_age : -1;
    const padletUrl =
      typeof body.padlet_url === "string" ? body.padlet_url.trim() : "";
    const isRemote = body.is_remote === true;
    const locationId =
      typeof body.location_id === "string" && body.location_id
        ? body.location_id
        : null;
    const spokenLanguageCode =
      typeof body.spoken_language_code === "string"
        ? body.spoken_language_code.trim()
        : "";

    if (!name) {
      return NextResponse.json(
        { error: "Product name is required" },
        { status: 400 }
      );
    }
    if (!description) {
      return NextResponse.json(
        { error: "Description is required" },
        { status: 400 }
      );
    }
    if (isNaN(tokenCost) || tokenCost < 1 || !Number.isInteger(tokenCost)) {
      return NextResponse.json(
        { error: "Token cost is required (must be a positive integer)" },
        { status: 400 }
      );
    }
    if (!gameId) {
      return NextResponse.json(
        { error: "Game is required" },
        { status: 400 }
      );
    }
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return NextResponse.json(
        { error: "Day of week must be 0-6" },
        { status: 400 }
      );
    }
    // eslint-disable-next-line security/detect-unsafe-regex -- anchored, fixed-length pattern; no ReDoS risk
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(startTime)) {
      return NextResponse.json(
        { error: "Start time must be a valid time" },
        { status: 400 }
      );
    }
    if (durationMinutes <= 0) {
      return NextResponse.json(
        { error: "Duration must be greater than 0" },
        { status: 400 }
      );
    }
    if (minAge < 0) {
      return NextResponse.json(
        { error: "Min age must be 0 or greater" },
        { status: 400 }
      );
    }
    if (maxAge < minAge) {
      return NextResponse.json(
        { error: "Max age must be greater than or equal to min age" },
        { status: 400 }
      );
    }
    if (padletUrl) {
      try {
        new URL(padletUrl);
      } catch {
        return NextResponse.json(
          { error: "Padlet URL must be a valid URL" },
          { status: 400 }
        );
      }
    }
    if (isRemote && locationId !== null) {
      return NextResponse.json(
        { error: "Remote products cannot have a location" },
        { status: 400 }
      );
    }
    if (!isRemote && !locationId) {
      return NextResponse.json(
        { error: "In-person products must have a location" },
        { status: 400 }
      );
    }
    if (!spokenLanguageCode) {
      return NextResponse.json(
        { error: "Spoken language is required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Preflight location_id so the caller sees a clean 400 instead of a
    // Postgres "invalid UUID" / trigger error bubbled up as 500. Runs before
    // the upload so a bad location never touches the bucket.
    if (locationId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(locationId)) {
        return NextResponse.json(
          { error: "location_id must be a UUID" },
          { status: 400 }
        );
      }
      const { data: locationRow, error: locationError } = await admin
        .from("locations")
        .select("type")
        .eq("id", locationId)
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

    // All metadata is valid. Upload the file, then insert — if the insert
    // fails for any reason, delete the uploaded object so the bucket never
    // holds an image for a product row that doesn't exist.
    const { error: uploadError } = await admin.storage
      .from("product-images")
      .upload(uploadMeta.path, file, {
        contentType: uploadMeta.contentType,
        upsert: false,
      });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data, error } = await admin
      .from("products")
      .insert({
        name,
        description,
        token_cost: tokenCost,
        image_path: uploadMeta.path,
        padlet_url: padletUrl || null,
        created_by: user.id,
        game_id: gameId,
        day_of_week: dayOfWeek,
        start_time: startTime,
        timezone: "Europe/Helsinki",
        duration_minutes: durationMinutes,
        min_age: minAge,
        max_age: maxAge,
        is_remote: isRemote,
        location_id: locationId,
        spoken_language_code: spokenLanguageCode,
      })
      .select()
      .single();

    if (error) {
      await admin.storage.from("product-images").remove([uploadMeta.path]);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ product: data });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
