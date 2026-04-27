import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import type { Database } from "@/types";

type TopicKind = Database["public"]["Enums"]["topic_kind_v2"];

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
    forbiddenMessage: "Only admins can create topics",
  });
  if (result instanceof NextResponse) return result;
  const { supabase } = result;

  let body: { name?: string; kind?: TopicKind; description?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const kind = body.kind;
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (kind !== "game" && kind !== "subject") {
    return NextResponse.json({ error: "Kind must be 'game' or 'subject'" }, { status: 400 });
  }

  const slug = slugify(name);
  if (!slug) {
    return NextResponse.json(
      { error: "Name must contain at least one alphanumeric character" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("topics_v2")
    .insert({
      name,
      slug,
      kind,
      description: body.description?.trim() || null,
    })
    .select("*")
    .single();

  if (error) {
    // 23505 = unique_violation (slug already exists). Surface as 409 so the
    // client can tell the admin to pick a different name.
    const status = error.code === "23505" ? 409 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data);
}
