import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ROLE_POST_LOGIN_PATHS } from "@/lib/constants/roles";
import { resolveInternalPath } from "@/lib/navigation/internal-path";
import { isSupportedLocale } from "@/lib/constants/locales";
import {
  LOCALE_COOKIE_NAME,
  localeCookieOptions,
} from "@/lib/locale-cookie";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // `next` is caller-supplied — only honor it if it resolves to a
  // same-origin path, else fall back to "/" (which routes by role below).
  const next = resolveInternalPath(searchParams.get("next"), "/");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Read the just-exchanged session's claims to determine the role.
      // getClaims() verifies the freshly-minted token locally (no GoTrue
      // round-trip) — see docs/architecture/performance.md.
      const { data: claimsData } = await supabase.auth.getClaims();
      const userId = claimsData?.claims.sub;

      if (userId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, locale")
          .eq("id", userId)
          .single();

        // Honor an explicit `next` destination; otherwise route by role.
        // Customers land on /select-profile (the family selector); other
        // roles go straight to their dashboard. See ROLE_POST_LOGIN_PATHS.
        const role = profile?.role;
        const redirectPath =
          next !== "/"
            ? next
            : role
              ? ROLE_POST_LOGIN_PATHS[role]
              : ROLE_POST_LOGIN_PATHS.customer;

        const response = NextResponse.redirect(`${origin}${redirectPath}`);

        // **Signing in seeds the locale cookie from the profile.** The
        // redirect above goes to a bare path, which the proxy resolves by the
        // cookie → `Accept-Language` → English ladder — so without this a
        // Finnish reader signing in on a fresh device would land on
        // `/en/parent`. `locale` rides on the profile read that was already
        // happening; a null value means "auto-detect from the browser" and is
        // deliberately left unwritten, since the header leg is what that
        // reader asked for.
        if (isSupportedLocale(profile?.locale)) {
          response.cookies.set(
            LOCALE_COOKIE_NAME,
            profile.locale,
            localeCookieOptions(),
          );
        }

        return response;
      }
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}
