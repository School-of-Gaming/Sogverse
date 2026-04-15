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
};

export async function POST(request: Request) {
  const result = await requireRole("admin", {
    forbiddenMessage: "Only admins can upload product images",
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

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'file' field" },
      { status: 400 }
    );
  }

  const rawName = file.name || "";
  const ext = rawName.split(".").pop()?.toLowerCase() ?? "";
  const contentType = EXT_TO_MIME[ext];
  if (!contentType) {
    return NextResponse.json(
      { error: "Unsupported file type. Use JPEG, PNG, WEBP, or AVIF." },
      { status: 415 }
    );
  }

  const normalisedExt = ext === "jpeg" ? "jpg" : ext;
  const path = `${randomUUID()}.${normalisedExt}`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from("product-images")
    .upload(path, file, { contentType, upsert: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ path });
}
