export const USER_ROLES = {
  ADMIN: "admin",
  CUSTOMER: "customer",
  GAMER: "gamer",
  GEDU: "gedu",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrator",
  customer: "Parent/Customer",
  gamer: "Gamer",
  gedu: "Game Educator",
};

export const ROLE_BADGES: Record<UserRole, { label: string; className: string }> = {
  gamer: { label: "Gamer", className: "bg-primary text-primary-foreground" },
  customer: { label: "Customer", className: "bg-secondary text-secondary-foreground" },
  gedu: { label: "Gedu", className: "bg-gradient-to-r from-primary to-secondary text-white" },
  admin: { label: "Admin", className: "bg-white text-black" },
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: "Full access to manage users, products, and system settings",
  customer: "Can purchase products and manage linked gamer accounts",
  gamer: "Child account with access to games and learning content",
  gedu: "Game educator with access to teaching tools and content",
};

export const ROLE_DASHBOARD_PATHS: Record<UserRole, string> = {
  admin: "/admin",
  customer: "/customer",
  gamer: "/gamer",
  gedu: "/gedu",
};

export const ROLE_LOGIN_PATHS: Record<UserRole, string> = {
  admin: "/login",
  customer: "/login",
  gamer: "/login",
  gedu: "/login",
};
