import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    // Verify the caller is authenticated and is an admin
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if ((profile as { role: string } | null)?.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can create products" },
        { status: 403 }
      );
    }

    const body = await request.json();

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("products")
      .insert({
        name: body.name,
        description: body.description ?? null,
        price: body.price,
        image_url: body.image_url ?? null,
        metadata: body.metadata ?? {},
      })
      .select()
      .single();

    if (error) {
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
