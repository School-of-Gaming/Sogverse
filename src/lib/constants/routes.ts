/** Centralized route paths — import and reference instead of hardcoding string literals. */
export const ROUTES = {
  home: "/",
  products: "/clubs",
  sorg: "/sorg",
  yty: "/yty",
  checkout: "/checkout",
  about: "/about",
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  setupAccount: "/setup-account",
  feedback: "/feedback",
  settings: "/settings",
  admin: {
    dashboard: "/admin",
    users: "/admin/users",
    usersAdd: "/admin/users/add",
    user: (id: string) => `/admin/users/${id}`,
    products: "/admin/products",
    productsAdd: "/admin/products/add",
    product: (id: string) => `/admin/products/${id}`,
    productEdit: (id: string) => `/admin/products/${id}/edit`,
    productClone: (id: string) => `/admin/products/add?clone=${id}`,
    groups: "/admin/groups",
    group: (groupId: string) => `/admin/groups/${groupId}`,
    voiceSession: (roomId: string) => `/admin/voice/${roomId}`,
    uiComponents: "/admin/ui-components",
    testing: "/admin/testing",
  },
  customer: {
    dashboard: "/parent",
    sorg: "/parent/sorg",
    billing: "/parent/billing",
    gamers: "/parent/gamers",
    group: (groupId: string, gamerId?: string) =>
      gamerId
        ? `/parent/groups/${groupId}?gamer=${gamerId}`
        : `/parent/groups/${groupId}`,
  },
  gamer: {
    dashboard: "/gamer",
    groups: "/gamer/groups",
    group: (groupId: string) => `/gamer/groups/${groupId}`,
    voiceSession: (roomId: string) => `/gamer/voice/${roomId}`,
  },
  gedu: {
    dashboard: "/gedu",
    groups: "/gedu/groups",
    group: (groupId: string) => `/gedu/groups/${groupId}`,
    voiceSession: (roomId: string) => `/gedu/voice/${roomId}`,
  },
} as const;
