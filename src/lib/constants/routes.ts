import { UserRole } from "./roles";

export const PUBLIC_ROUTES = [
  "/",
  "/products",
  "/sorg",
  "/about",
  "/login",
  "/gamer-login",
  "/register",
  "/forgot-password",
] as const;

export const AUTH_ROUTES = [
  "/login",
  "/gamer-login",
  "/register",
  "/forgot-password",
] as const;

export const PROTECTED_ROUTES = {
  admin: ["/admin"],
  customer: ["/customer"],
  gamer: ["/gamer"],
  gedu: ["/gedu"],
  shared: ["/settings"],
} as const;

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export function getRequiredRole(pathname: string): UserRole | null {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/customer")) return "customer";
  if (pathname.startsWith("/gamer")) return "gamer";
  if (pathname.startsWith("/gedu")) return "gedu";
  return null;
}

export function canAccessRoute(pathname: string, userRole: UserRole): boolean {
  const requiredRole = getRequiredRole(pathname);

  if (!requiredRole) return true;
  if (pathname.startsWith("/settings")) return true;

  return requiredRole === userRole;
}
