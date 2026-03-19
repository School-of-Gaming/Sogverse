import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

import { ROUTES } from "@/lib/constants";
import { ROLE_DASHBOARD_PATHS } from "@/lib/constants/roles";

// Routes that don't require authentication
// resetPassword and setupAccount are public (not auth routes) because the user
// arrives via an email link with hash tokens — they aren't authenticated yet.
const PUBLIC_ROUTES = [ROUTES.home, ROUTES.products, ROUTES.sorg, ROUTES.yty, ROUTES.checkout, ROUTES.about, ROUTES.resetPassword, ROUTES.setupAccount];

// Routes for authentication (login, register, etc.)
const AUTH_ROUTES = [ROUTES.login, ROUTES.register, ROUTES.forgotPassword];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let supabaseResponse = NextResponse.next({
    request,
  });

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

  // Helper: create a redirect that preserves refreshed auth cookies
  function redirect(url: URL) {
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
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

  // Shared routes (feedback, settings) are accessible to all authenticated users
  if (pathname.startsWith(ROUTES.feedback) || pathname.startsWith(ROUTES.settings)) {
    return supabaseResponse;
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
