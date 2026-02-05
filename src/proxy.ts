import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";
import type { UserRole } from "@/types";

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/", "/products", "/about"];

// Routes for authentication (login, register, etc.)
const AUTH_ROUTES = ["/login", "/gamer-login", "/register", "/forgot-password"];

// Role-specific dashboard routes
const ROLE_ROUTES: Record<string, string> = {
  admin: "/admin",
  customer: "/customer",
  gamer: "/gamer",
  gedu: "/gedu",
};

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Create response that can be modified
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Create Supabase client with cookie handling
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: CookieOptions }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if expired
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Check if route is public
  const isPublicRoute =
    PUBLIC_ROUTES.some((route) => pathname === route) ||
    pathname.startsWith("/api/");

  // Check if route is for authentication
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  // If user is logged in and trying to access auth routes, redirect to their dashboard
  if (user && isAuthRoute) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile) {
      const profileRole = (profile as { role: UserRole }).role;
      const dashboardPath = ROLE_ROUTES[profileRole] || "/customer";
      return NextResponse.redirect(new URL(dashboardPath, request.url));
    }
  }

  // If public route or auth route, allow access
  if (isPublicRoute || isAuthRoute) {
    return response;
  }

  // For protected routes, require authentication
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Get user profile for role-based access control
  const { data: profileData } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profileData) {
    // Profile not found, redirect to login
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Check role-based access
  const userRole = (profileData as { role: UserRole }).role;

  // Settings is accessible to all authenticated users
  if (pathname.startsWith("/settings")) {
    return response;
  }

  // Check if user has access to the requested route
  for (const [role, basePath] of Object.entries(ROLE_ROUTES)) {
    if (pathname.startsWith(basePath)) {
      if (role !== userRole) {
        // User trying to access route they don't have permission for
        // Redirect to their own dashboard
        const correctDashboard = ROLE_ROUTES[userRole];
        return NextResponse.redirect(new URL(correctDashboard, request.url));
      }
      break;
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
