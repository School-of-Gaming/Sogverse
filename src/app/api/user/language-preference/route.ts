import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupportedLanguage } from "@/lib/constants/language-preference";

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { language } = await request.json();

    if (!isSupportedLanguage(language)) {
      return NextResponse.json(
        { error: "Invalid language" },
        { status: 400 },
      );
    }

    // Admin client for the same reason as the currency route — see
    // src/app/api/user/currency/route.ts for the @supabase/ssr workaround.
    const admin = createAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({ language_preference: language })
      .eq("id", user.id);

    if (error) {
      console.error("Language preference update error:", error);
      return NextResponse.json(
        { error: "Failed to update language preference" },
        { status: 500 },
      );
    }

    return NextResponse.json({ language });
  } catch (err) {
    console.error("Language preference update error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
