export const USER_ROLES = {
  ADMIN: "admin",
  CUSTOMER: "customer",
  GAMER: "gamer",
  GEDU: "gedu",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];


export const ROLE_BADGES: Record<UserRole, { label: string; className: string }> = {
  gamer: { label: "Gamer", className: "bg-primary text-primary-foreground" },
  customer: { label: "Parent", className: "bg-secondary text-secondary-foreground" },
  gedu: { label: "Gedu", className: "bg-gradient-to-r from-primary to-secondary text-white" },
  admin: { label: "Admin", className: "bg-white text-black" },
};

export const ROLE_DASHBOARD_PATHS: Record<UserRole, string> = {
  admin: "/admin",
  customer: "/parent",
  gamer: "/gamer",
  gedu: "/gedu",
};
