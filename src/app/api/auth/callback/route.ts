import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Get the user to determine their role
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        // Redirect to role-specific dashboard or the intended destination
        const roleRedirects: Record<string, string> = {
          admin: "/admin",
          customer: "/customer",
          gamer: "/gamer",
          gedu: "/gedu",
        };

        const role = (profile as { role: UserRole } | null)?.role;
        const redirectPath =
          next !== "/"
            ? next
            : role
              ? roleRedirects[role]
              : "/customer";

        return NextResponse.redirect(`${origin}${redirectPath}`);
      }
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
