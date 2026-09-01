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

/**
 * The ruled role families (design pass, 2026-09-01): the gamer keeps amber and
 * the admin keeps ink; the parent takes harmony and the gedu takes wit's soft
 * variant — which retires the amber-to-violet gradient the fourth role was
 * given when there was no hue left for it. Inks are the script-checked pairs
 * from the button grammar fills (dark ink on both: harmony-strong 6.11:1,
 * wit-soft 8.10:1).
 */
export const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  gamer: "bg-primary text-primary-foreground",
  customer: "bg-yty-harmony-strong text-background",
  gedu: "bg-yty-wit-soft text-background",
  admin: "bg-foreground text-background",
};

export const ROLE_DASHBOARD_PATHS: Record<UserRole, string> = {
  admin: "/admin",
  customer: "/parent",
  gamer: "/gamer",
  gedu: "/gedu",
};

/**
 * Where each role lands immediately after sign-in when no specific redirect
 * was requested. Customers land on the family profile selector so a parent
 * can pick which family member is entering Sogverse; everyone else goes
 * straight to their dashboard. Routes that need a real dashboard URL (e.g.
 * the proxy's role-access check) must keep using ROLE_DASHBOARD_PATHS — the
 * selector is *not* a parent-only dashboard, it's an interstitial.
 */
export const ROLE_POST_LOGIN_PATHS: Record<UserRole, string> = {
  admin: "/admin",
  customer: "/select-profile",
  gamer: "/gamer",
  gedu: "/gedu",
};
