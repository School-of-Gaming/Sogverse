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
  feedback: "/feedback",
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
    groups: "/gedu/groups",
    group: (groupId: string) => `/gedu/groups/${groupId}`,
    voice: (roomId: string) => `/gedu/voice/${roomId}`,
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


