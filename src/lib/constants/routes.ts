import { UserRole } from "./roles";

/** Centralized route paths — import and reference instead of hardcoding string literals. */
export const ROUTES = {
  home: "/",
  products: "/products",
  sorg: "/sorg",
  checkout: "/checkout",
  about: "/about",
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  settings: "/settings",
  admin: {
    dashboard: "/admin",
    users: "/admin/users",
    usersAdd: "/admin/users/add",
    products: "/admin/products",
    voice: "/admin/voice",
    uiComponents: "/admin/ui-components",
    testing: "/admin/testing",
  },
  customer: {
    dashboard: "/customer",
    sorg: "/customer/sorg",
    billing: "/customer/billing",
    gamers: "/customer/gamers",
  },
  gamer: {
    dashboard: "/gamer",
    games: "/gamer/games",
    voice: "/gamer/voice",
  },
  gedu: {
    dashboard: "/gedu",
    students: "/gedu/students",
    courses: "/gedu/courses",
    voice: "/gedu/voice",
  },
} as const;

export const PUBLIC_ROUTES = [
  ROUTES.home,
  ROUTES.products,
  ROUTES.sorg,
  ROUTES.checkout,
  ROUTES.about,
  ROUTES.login,
  ROUTES.register,
  ROUTES.forgotPassword,
] as const;

export const AUTH_ROUTES = [
  ROUTES.login,
  ROUTES.register,
  ROUTES.forgotPassword,
] as const;

export const PROTECTED_ROUTES = {
  admin: [ROUTES.admin.dashboard],
  customer: [ROUTES.customer.dashboard],
  gamer: [ROUTES.gamer.dashboard],
  gedu: [ROUTES.gedu.dashboard],
  shared: [ROUTES.settings],
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
  if (pathname.startsWith(ROUTES.admin.dashboard)) return "admin";
  if (pathname.startsWith(ROUTES.customer.dashboard)) return "customer";
  if (pathname.startsWith(ROUTES.gamer.dashboard)) return "gamer";
  if (pathname.startsWith(ROUTES.gedu.dashboard)) return "gedu";
  return null;
}

export function canAccessRoute(pathname: string, userRole: UserRole): boolean {
  const requiredRole = getRequiredRole(pathname);

  if (!requiredRole) return true;
  if (pathname.startsWith(ROUTES.settings)) return true;

  return requiredRole === userRole;
}
