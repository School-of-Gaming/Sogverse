import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ROLE_POST_LOGIN_PATHS } from "@/lib/constants/roles";

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

        // Honor an explicit `next` destination; otherwise route by role.
        // Customers land on /select-profile (the family selector); other
        // roles go straight to their dashboard. See ROLE_POST_LOGIN_PATHS.
        const role = profile?.role;
        const redirectPath =
          next !== "/"
            ? next
            : role
              ? ROLE_POST_LOGIN_PATHS[role as keyof typeof ROLE_POST_LOGIN_PATHS]
              : ROLE_POST_LOGIN_PATHS.customer;

        return NextResponse.redirect(`${origin}${redirectPath}`);
      }
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
