import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupportedLocale } from "@/lib/constants/locales";

export async function PATCH(request: Request) {
  try {
    // `getUser()` here is the getClaims-backed server helper (local JWT
    // verification), not GoTrue's `auth.getUser()`. We only need the user id.
    const user = await getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { locale } = await request.json();

    if (!isSupportedLocale(locale)) {
      return NextResponse.json(
        { error: "Invalid locale" },
        { status: 400 },
      );
    }

    // Admin client for the same reason as the currency route — see
    // src/app/api/user/currency/route.ts for the @supabase/ssr workaround.
    const admin = createAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({ locale })
      .eq("id", user.id);

    if (error) {
      console.error("Locale update error:", error);
      return NextResponse.json(
        { error: "Failed to update locale" },
        { status: 500 },
      );
    }

    return NextResponse.json({ locale });
  } catch (err) {
    console.error("Locale update error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
