import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { FAMILY_SESSION_COOKIE_NAME, PIN_COOKIE_NAME } from "@/lib/pin-session";
import { resolveInternalPath } from "@/lib/navigation/internal-path";

// Sign-out handler. The SSR Supabase client clears the session cookies via
// its setAll callback before we return the redirect. The browser follows the
// 303 as a full-page GET — to "/" by default, or to the internal path a form
// asked for in `next` — which re-runs the root layout and hydrates
// AuthProvider with initialUser=null.
//
// POST (not GET) + SameSite=Lax cookies prevents forced-logout CSRF —
// cross-origin top-level POST navigations don't carry Lax cookies, so a
// malicious page can't trigger sign-out. See docs/records/security-audit-2026-03.md #8.
// The handler reads `request.url` and, at most, one urlencoded form field, so
// it takes the platform `Request` rather than the framework's subclass —
// Next.js passes one either way.
export async function POST(request: Request) {
  // Read the destination before signing out: a body that fails to parse must
  // not be discovered after the session is already gone.
  const next = await readNextPath(request);
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Drop both session markers so the next session starts locked and unmarked:
  // the parent-PIN unlock cookie, and the switch route s family-session marker.
  // Both are bound to a session_id that is now gone, so neither would validate
  // anyway — dropping them is what keeps the cookie jar honest.
  const cookieStore = await cookies();
  cookieStore.delete(PIN_COOKIE_NAME);
  cookieStore.delete(FAMILY_SESSION_COOKIE_NAME);
  return NextResponse.redirect(new URL(next, request.url), { status: 303 });
}

/**
 * Where the browser lands after the sign-out. The header's sign-out form sends
 * no body and lands on the home page; the sign-out-to-switch dialog posts
 * `next=/login`, because its whole point is signing in as someone else. The
 * value is caller-supplied, so it goes through `resolveInternalPath()` (root
 * `CLAUDE.md` § Redirects) and anything that is not an internal path — an
 * absolute URL, a protocol-relative one, a body that is not a form at all —
 * falls back to "/".
 */
async function readNextPath(request: Request): Promise<string> {
  try {
    const form = await request.formData();
    const candidate = form.get("next");
    return resolveInternalPath(
      typeof candidate === "string" ? candidate : undefined,
      "/",
    );
  } catch {
    return "/";
  }
}
