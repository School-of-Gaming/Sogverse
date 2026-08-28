import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { PIN_COOKIE_NAME } from "@/lib/pin-session";

// Sign-out handler. The SSR Supabase client clears the session cookies via
// its setAll callback before we return the redirect. The browser follows the
// 303 as a full-page GET to "/", which re-runs the root layout and hydrates
// AuthProvider with initialUser=null.
//
// POST (not GET) + SameSite=Lax cookies prevents forced-logout CSRF —
// cross-origin top-level POST navigations don't carry Lax cookies, so a
// malicious page can't trigger sign-out. See docs/records/security-audit-2026-03.md #8.
// The handler reads only `request.url`, so it takes the platform `Request`
// rather than the framework's subclass — Next.js passes one either way.
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Drop the parent-PIN unlock cookie so the next session starts locked.
  (await cookies()).delete(PIN_COOKIE_NAME);
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
