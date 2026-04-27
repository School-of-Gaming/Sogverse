import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { isSupportedLocale } from "@/lib/constants/locales";
import type { Database } from "@/types";

type TopicKind = Database["public"]["Enums"]["topic_kind_v2"];

// Slug stays locale-agnostic — it's used in browse URLs (`/browse?topic=foo`)
// and must be stable regardless of the locale the admin used at create time.
// Built from the admin's typed name; if they create the topic in Finnish, the
// slug is the Finnish name slugified. Future "rename slug" admin action is
// out of scope.
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

  let body: {
    name?: string;
    kind?: TopicKind;
    description?: string;
    locale?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const kind = body.kind;
  const locale = body.locale;
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (kind !== "game" && kind !== "subject") {
    return NextResponse.json({ error: "Kind must be 'game' or 'subject'" }, { status: 400 });
  }
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

  // Two-step insert — parent then translation. RLS on both tables gates this
  // to admin via admin_full_access_*. If the translation insert fails, the
  // parent row is orphaned (no name in any locale) — but that's strictly
  // worse only if the request is interrupted between the two writes. Both
  // run in the same request so a network drop affects them equally; if this
  // becomes an issue we move it into an RPC like create_product_v2.
  const { data: topic, error: topicError } = await supabase
    .from("topics_v2")
    .insert({ slug, kind })
    .select("*")
    .single();

  if (topicError) {
    const status = topicError.code === "23505" ? 409 : 400;
    return NextResponse.json({ error: topicError.message }, { status });
  }

  const { error: translationError } = await supabase
    .from("topic_translations_v2")
    .insert({
      topic_id: topic.id,
      locale,
      name,
      description: body.description?.trim() || null,
    });

  if (translationError) {
    // Roll back the parent row. If this fails too the admin gets a topic
    // with no translations — visible to admin through the manage UI but
    // invisible to parents. Acceptable cost for an extremely rare path.
    await supabase.from("topics_v2").delete().eq("id", topic.id);
    return NextResponse.json({ error: translationError.message }, { status: 400 });
  }

  return NextResponse.json(topic);
}
