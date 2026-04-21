export const USER_ROLES = {
  ADMIN: "admin",
  CUSTOMER: "customer",
  GAMER: "gamer",
  GEDU: "gedu",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

/** Translation keys in the `common` namespace for each role's display name. */
export const ROLE_LABEL_KEYS = {
  admin: "roleAdmin",
  customer: "roleParent",
  gamer: "roleGamer",
  gedu: "roleGedu",
} as const satisfies Record<UserRole, string>;

export type RoleLabelKey = (typeof ROLE_LABEL_KEYS)[UserRole];

export const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  gamer: "bg-primary text-primary-foreground",
  customer: "bg-secondary text-secondary-foreground",
  gedu: "bg-gradient-to-r from-primary to-secondary text-secondary-foreground",
  admin: "bg-foreground text-background",
};

export const ROLE_DASHBOARD_PATHS: Record<UserRole, string> = {
  admin: "/admin",
  customer: "/parent",
  gamer: "/gamer",
  gedu: "/gedu",
};
