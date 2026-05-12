import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

import { ROUTES } from "@/lib/constants";
import { ROLE_DASHBOARD_PATHS } from "@/lib/constants/roles";

// Routes that don't require authentication
// resetPassword and setupAccount are public (not auth routes) because the user
// arrives via an email link with hash tokens — they aren't authenticated yet.
// ROUTES.voice.prefix is public because instant voice rooms are share-via-link
// by design — see docs/instant-voice-rooms.md.
const PUBLIC_ROUTES = [ROUTES.home, ROUTES.shop, ROUTES.clubs, ROUTES.camps, ROUTES.events, ROUTES.help, ROUTES.docs, ROUTES.resetPassword, ROUTES.setupAccount, ROUTES.voice.prefix];

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
    // dev script-src includes https://cdn.mouseflow.com for Beta session recording — remove with the rest of the Mouseflow integration after Beta.
    // Prod uses strict-dynamic + nonce, which trusts nonce-tagged scripts (via <Script nonce={nonce}>) without needing the cdn allowlisted.
    isProd
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://c.daily.co https://cdn.mouseflow.com",
    "style-src 'self' 'unsafe-inline'",
    // mc-heads.net renders the Minecraft skin body avatar in MinecraftUsernameField (settings page for gamers/gedus)
    `img-src 'self' data: blob: ${SUPABASE_HOST} https://mc-heads.net`,
    "font-src 'self'",
    // wss: Supabase Realtime, Daily.co signaling; sentry: Daily.co's bundled error reporting;
    // mouseflow: beta-only session recording (remove with the rest of the Mouseflow integration after Beta)
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.daily.co wss://*.daily.co https://*.ingest.sentry.io https://*.mouseflow.com",
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

  // Refresh session — must happen before any other logic
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Helper: create a redirect that preserves refreshed auth cookies and CSP
  function redirect(url: URL) {
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    redirectResponse.headers.set("Content-Security-Policy", cspHeader);
    return redirectResponse;
  }

  // Check if route is public
  const isPublicRoute =
    PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`)) ||
    pathname.startsWith("/api/");

  // Check if route is for authentication
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  // If user is logged in and trying to access auth routes, redirect to their dashboard
  if (user && isAuthRoute) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profileError) {
      const profileRole = profile.role;
      const dashboardPath = ROLE_DASHBOARD_PATHS[profileRole] || ROUTES.customer.dashboard;
      return redirect(new URL(dashboardPath, request.url));
    }
  }

  // If public route or auth route, allow access
  if (isPublicRoute || isAuthRoute) {
    return supabaseResponse;
  }

  // For protected routes, require authentication
  if (!user) {
    const loginUrl = new URL(ROUTES.login, request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return redirect(loginUrl);
  }

  // Get user profile for role-based access control
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return redirect(new URL(ROUTES.login, request.url));
  }

  // Check role-based access
  const userRole = profileData.role;

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
