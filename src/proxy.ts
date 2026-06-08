import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

import { ROUTES } from "@/lib/constants";
import { ROLE_DASHBOARD_PATHS } from "@/lib/constants/roles";
import { PIN_COOKIE_NAME, isPinTokenValid } from "@/lib/pin-session";

// Paths a LOCKED customer session may still reach (so the parent-PIN gate
// doesn't trap them). `/api/*` is owned by requireRole(); auth routes are the
// sign-in/out flow; the rest are the gate itself, the profile chooser (where
// they can drop to a gamer or choose to enter the PIN), and the email-reset
// landing page.
function isPinExemptPath(pathname: string, isAuthRoute: boolean): boolean {
  if (pathname.startsWith("/api/") || isAuthRoute) return true;
  const exempt = [ROUTES.customer.unlock, ROUTES.selectProfile, ROUTES.resetPin];
  return exempt.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

// Routes that don't require authentication
// resetPassword and setupAccount are public (not auth routes) because the user
// arrives via an email link with hash tokens — they aren't authenticated yet.
// ROUTES.voice.prefix is public because instant voice rooms are share-via-link
// by design — see docs/instant-voice-rooms.md. The authenticated group voice
// room at /voice/group/[id] is carved back out below — it shares the prefix
// but must require a session.
// ROUTES.shop covers the storefront and its product-detail pages (/shop/[id])
// via the prefix match below.
const PUBLIC_ROUTES = [ROUTES.home, ROUTES.shop, ROUTES.help, ROUTES.privacy, ROUTES.termsAndConditions, ROUTES.antiBullying, ROUTES.docs, ROUTES.resetPassword, ROUTES.resetPin, ROUTES.setupAccount, ROUTES.voice.prefix];

// The /voice/* prefix is public for instant rooms, but /voice/group/[id] is
// the authenticated group voice room — gamers join as participants, gedus
// and admins as moderators. The token endpoint enforces role + assignment,
// but we still gate at the proxy so unauthenticated visitors get redirected
// to /login instead of landing on a page that can't mint a token. Pulled
// from `ROUTES.voice.groupSessionPrefix` so a rename of the route helper
// stays in sync with the proxy carve-out.
const AUTH_REQUIRED_VOICE_PREFIX = ROUTES.voice.groupSessionPrefix;

// Routes for authentication (login, register, etc.)
const AUTH_ROUTES = [ROUTES.login, ROUTES.register, ROUTES.forgotPassword];

/**
 * Build a Content-Security-Policy header value.
 * In production, uses a per-request nonce so only scripts explicitly tagged by
 * Next.js's SSR pipeline can execute (blocks injected inline scripts — the main
 * XSS vector CSP exists to stop).
 * In development, falls back to unsafe-inline/unsafe-eval because Next.js HMR
 * injects scripts outside the SSR pipeline that can't receive nonces.
 */
// Pulled from NEXT_PUBLIC_SUPABASE_URL at module load so we don't hardcode the
// project ref in CSP. Falls back to the wildcard host when the env var is
// missing (e.g. early in test setup) — production builds always have it set.
const SUPABASE_HOST = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "https://*.supabase.co";
  try {
    return new URL(url).origin;
  } catch {
    return "https://*.supabase.co";
  }
})();

function buildCspHeader(nonce: string): string {
  const isProd = process.env.NODE_ENV === "production";

  return [
    "default-src 'self'",
    isProd
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://c.daily.co",
    "style-src 'self' 'unsafe-inline'",
    // mc-heads.net renders the Minecraft skin body avatar in MinecraftUsernameField (settings page for gamers/gedus)
    `img-src 'self' data: blob: ${SUPABASE_HOST} https://mc-heads.net`,
    "font-src 'self'",
    // wss: Supabase Realtime, Daily.co signaling; sentry: Daily.co's bundled error reporting
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.daily.co wss://*.daily.co https://*.ingest.sentry.io",
    "frame-src 'self' https://*.daily.co https://*.stripe.com",
    // blob: workers used by Daily.co for WebRTC media processing
    "worker-src 'self' blob:",
    "frame-ancestors 'self'",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  // Generate a per-request nonce for CSP. Setting it on the request headers
  // lets Next.js's SSR pipeline read the nonce and apply it to every <script>
  // tag it renders (including next/script components like SpeedInsights).
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const cspHeader = buildCspHeader(nonce);

  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", cspHeader);

  const { pathname } = request.nextUrl;

  let supabaseResponse = NextResponse.next({
    request,
  });
  supabaseResponse.headers.set("Content-Security-Policy", cspHeader);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          // Re-apply CSP after Supabase cookie handling recreates the response
          supabaseResponse.headers.set("Content-Security-Policy", cspHeader);
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Verify (and refresh, if near expiry) the session — must happen before any
  // other logic. getClaims() verifies the JWT locally against the project's
  // ES256 JWKS, so there's no GoTrue round-trip on the hot path. The
  // getSession() it calls internally still refreshes the token when it's within
  // the expiry margin — writing new cookies via the handler above — so the
  // proxy remains the single token-refresh point. See docs/performance.md.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub ?? null;
  const sessionId = claimsData?.claims.session_id ?? null;

  // Helper: create a redirect that preserves refreshed auth cookies and CSP
  function redirect(url: URL) {
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    redirectResponse.headers.set("Content-Security-Policy", cspHeader);
    return redirectResponse;
  }

  // Check if route is public. /api/* always passes (handlers own their auth).
  // The /voice/group/[id] branch is excluded so its public-prefix match here
  // can't shadow the authenticated-route handling below.
  const isPublicRoute =
    pathname.startsWith("/api/") ||
    (!pathname.startsWith(AUTH_REQUIRED_VOICE_PREFIX) &&
      PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`)));

  // Check if route is for authentication
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  // Resolve the caller's role once (when authenticated) and reuse it for every
  // routing decision below. A valid PIN-unlock cookie is itself proof of a
  // verified customer, so it lets us skip the profile lookup entirely — that's
  // the short-circuit that keeps logged-out and already-unlocked traffic on
  // public pages (e.g. /shop) from paying for a query.
  //
  // Note this treats cookie validity as proof of *current* customer role, not
  // just unlock state — the token is an unforgeable HMAC over (userId,
  // session_id), so only a genuine customer who unlocked THIS session could hold
  // it. Not a security concern: the worst a stale cookie buys is acting as the
  // account it was already minted for. The one theoretical gap is a mid-session
  // role change (customer → gedu) leaving the old cookie treating them as a
  // customer until re-login — and we treat role changes as a thing that doesn't
  // happen mid-session. Privileged routes (`/admin`) are role-gated below
  // regardless, so this never grants access the role itself wouldn't.
  let userRole: Database["public"]["Enums"]["user_role"] | null = null;
  if (userId) {
    const pinVerified =
      sessionId !== null &&
      (await isPinTokenValid(request.cookies.get(PIN_COOKIE_NAME)?.value, userId, sessionId));

    if (pinVerified) {
      userRole = "customer";
    } else {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();
      if (!profileError) userRole = profile.role;

      // Parent-PIN gate: a locked customer session may not act as the parent
      // ANYWHERE — including public pages like /shop — so this runs before the
      // public-route early return. The boundary is the session's state, not the
      // route. API routes are gated separately in requireRole().
      if (userRole === "customer" && !isPinExemptPath(pathname, isAuthRoute)) {
        const unlockUrl = new URL(ROUTES.customer.unlock, request.url);
        unlockUrl.searchParams.set("redirect", pathname);
        return redirect(unlockUrl);
      }
    }
  }

  // Logged-in users on auth routes go to their dashboard.
  if (userId && isAuthRoute && userRole) {
    const dashboardPath = ROLE_DASHBOARD_PATHS[userRole] || ROUTES.customer.dashboard;
    return redirect(new URL(dashboardPath, request.url));
  }

  // Signed-in parents, gamers, and gedus visiting the home page get bounced
  // to their dashboard — mirrors the SOG-logo behavior so the home page
  // isn't a dead-end for them. Admins pass through.
  if (
    userId &&
    pathname === ROUTES.home &&
    (userRole === "customer" || userRole === "gamer" || userRole === "gedu")
  ) {
    return redirect(new URL(ROLE_DASHBOARD_PATHS[userRole], request.url));
  }

  // If public route or auth route, allow access
  if (isPublicRoute || isAuthRoute) {
    return supabaseResponse;
  }

  // For protected routes, require authentication
  if (!userId) {
    const loginUrl = new URL(ROUTES.login, request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return redirect(loginUrl);
  }

  // Protected route but the role lookup failed → bounce to login.
  if (!userRole) {
    return redirect(new URL(ROUTES.login, request.url));
  }

  // /settings is shared across roles — accessible to any authenticated user.
  if (pathname.startsWith(ROUTES.settings)) {
    return supabaseResponse;
  }

  // /preview/* are admin-only mock surfaces linked from /admin/ui-components.
  // They live in the (public) layout group so the page renders in the
  // parent-facing chrome (header + footer, no admin sidebar) — but only
  // admins should be able to reach them. Non-admins bounce to their own
  // dashboard; unauthenticated users were already redirected to /login above.
  if (pathname.startsWith("/preview/") && userRole !== "admin") {
    return redirect(new URL(ROLE_DASHBOARD_PATHS[userRole], request.url));
  }

  // Check if user has access to the requested route
  for (const [role, basePath] of Object.entries(ROLE_DASHBOARD_PATHS)) {
    if (pathname.startsWith(basePath)) {
      if (role !== userRole) {
        const correctDashboard = ROLE_DASHBOARD_PATHS[userRole];
        return redirect(new URL(correctDashboard, request.url));
      }
      break;
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     * - Next.js metadata file conventions (opengraph-image, sitemap.xml, robots.txt)
     */
    "/((?!_next/static|_next/image|favicon.ico|opengraph-image|sitemap\\.xml|robots\\.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
