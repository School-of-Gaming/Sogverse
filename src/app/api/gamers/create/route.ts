import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateGamerEmail } from "@/lib/utils";

export async function POST(request: Request) {
  try {
    // Verify the caller is authenticated and is a customer
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

    if ((profile as { role: string } | null)?.role !== "customer") {
      return NextResponse.json(
        { error: "Only customers can create gamer accounts" },
        { status: 403 }
      );
    }

    const { username, password, displayName } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const syntheticEmail = generateGamerEmail(username);
    const admin = createAdminClient();

    // Create auth user with admin client — no confirmation email sent
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email: syntheticEmail,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: displayName || username,
          role: "gamer",
          username,
        },
      });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: "Failed to create gamer account" },
        { status: 500 }
      );
    }

    // Wait for the database trigger to create the profile
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Fetch the created profile
    const { data: gamerProfile, error: profileError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", authData.user.id)
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    // Create parent-gamer link
    const { data: linkData, error: linkError } = await admin
      .from("parent_gamer")
      .insert({
        parent_id: user.id,
        gamer_id: authData.user.id,
      })
      .select()
      .single();

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }

    return NextResponse.json({ gamer: gamerProfile, link: linkData });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
