import type * as SogUi from "@sog/ui";

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
 * The ink a role's word is set in: its Yty family.
 *
 * **A role is carried by the colour on its word and by nothing else** — no
 * mark, no fill. The library decides which family belongs to which role and
 * why, and states there that a role has no glyph because its own name is always
 * beside it. All four roles wear one: the admin used to take the quiet ink, and
 * now wears Valor.
 *
 * **The classes are literals, and the type is what ties them to the library.**
 * Tailwind scans source text, so a class assembled from a family id at render
 * time compiles to nothing at all and the strings have to be written out. The
 * mapped type derives the class each role is allowed to carry from the
 * library's own row, so a family reassigned in SOG-UI fails to compile here
 * rather than leaving Sogverse quietly painting the old one. The row is
 * imported in type position only: nothing about a colour needs the icon set
 * this module would otherwise pull into every page that names a role.
 */
type RoleInk<R extends UserRole> =
  `text-yty-${(typeof SogUi.ROLE_GRAMMAR)[R]["family"]}`;

export const ROLE_INK: { [R in UserRole]: RoleInk<R> } = {
  gamer: "text-yty-glow",
  customer: "text-yty-harmony",
  gedu: "text-yty-wit",
  admin: "text-yty-valor",
};

/**
 * What a role chip wears — the library's row, drawn.
 *
 * **A figure, not a fill: a neutral edge and the role's word in its family's
 * colour.** The chips used to be fills — act for a gamer, world for a
 * parent, and for a gedu the one place in the product that blended the two
 * signature colours into each other. Every fill this palette offers is light
 * enough that only a dark label reads on it, which is the shape it is worst at;
 * on the dark ground the colour is at its most vivid as ink, so the word
 * carries it.
 *
 * `bg-transparent` and not a ground: a role chip is rendered on a table row, on
 * a card and inside a voice roster, and the one thing all three have in common
 * is that whatever they are sitting on is already the right ground.
 */
export const ROLE_BADGE_STYLES: Record<UserRole, string> = {
  gamer: `border-border bg-transparent ${ROLE_INK.gamer}`,
  customer: `border-border bg-transparent ${ROLE_INK.customer}`,
  gedu: `border-border bg-transparent ${ROLE_INK.gedu}`,
  admin: `border-border bg-transparent ${ROLE_INK.admin}`,
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
