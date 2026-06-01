import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { isSupportedLocale } from "@/lib/constants/locales";

// See topics/create/route.ts for the slug rationale — same locale-agnostic
// approach since tags are also used as URL filters in browse.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(request: Request) {
  const result = await requireRole("admin", {
    forbiddenMessage: "Only admins can create tags",
  });
  if (result instanceof NextResponse) return result;
  const { supabase } = result;

  let body: { name?: string; description?: string; locale?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const locale = body.locale;
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!isSupportedLocale(locale)) {
    return NextResponse.json(
      { error: "locale must be a supported locale" },
      { status: 400 },
    );
  }

  const slug = slugify(name);
  if (!slug) {
    return NextResponse.json(
      { error: "Name must contain at least one alphanumeric character" },
      { status: 400 }
    );
  }

  const { data: tag, error: tagError } = await supabase
    .from("tags")
    .insert({ slug })
    .select("*")
    .single();

  if (tagError) {
    const status = tagError.code === "23505" ? 409 : 400;
    return NextResponse.json({ error: tagError.message }, { status });
  }

  const { error: translationError } = await supabase
    .from("tag_translations")
    .insert({
      tag_id: tag.id,
      locale,
      name,
      description: body.description?.trim() || null,
    });

  if (translationError) {
    await supabase.from("tags").delete().eq("id", tag.id);
    return NextResponse.json({ error: translationError.message }, { status: 400 });
  }

  return NextResponse.json(tag);
}
