import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupportedLocale } from "@/lib/constants/locales";

/**
 * PATCH /api/user/locale — set the caller's own UI locale.
 *
 * Model B. `profiles.locale` carries a column-level UPDATE grant and the
 * users_update_own_profile policy scopes the statement to `auth.uid()`, so the
 * database refuses a write aimed at anyone else's row even though this handler
 * never aims one.
 *
 * (The route previously used the service-role client to work around a typing
 * problem in @supabase/ssr 0.5.2, where `.update()` resolved as `never`. That
 * dependency is on 0.9 now and the workaround was obsolete — the grant, not the
 * types, was the real reason the write couldn't run as the user.)
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();

    // `getClaims()` verifies the access token locally against the project JWKS —
    // no GoTrue round-trip. We only need the subject.
    const { data, error: claimsError } = await supabase.auth.getClaims();
    const userId = data?.claims.sub;

    if (claimsError || !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { locale } = await request.json();

    if (!isSupportedLocale(locale)) {
      return NextResponse.json(
        { error: "Invalid locale" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("profiles")
      .update({ locale })
      .eq("id", userId);

    if (error) {
      console.error("Locale update error:", error);
      const status = error.code === "42501" ? 403 : 500;
      return NextResponse.json(
        { error: "Failed to update locale" },
        { status },
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
