import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Sign-out handler. The SSR Supabase client clears the session cookies via
// its setAll callback before we return the redirect. The browser follows the
// 303 as a full-page GET to "/", which re-runs the root layout and hydrates
// AuthProvider with initialUser=null.
//
// POST (not GET) + SameSite=Lax cookies prevents forced-logout CSRF —
// cross-origin top-level POST navigations don't carry Lax cookies, so a
// malicious page can't trigger sign-out. See docs/SECURITY_REPORT.md #8.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
