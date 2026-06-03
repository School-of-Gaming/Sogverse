import type { Database } from "@/types/database.types";

type ProductType = Database["public"]["Enums"]["product_type"];

/**
 * Picks the gedu session-details URL prefix from a product's type. All three
 * routes (`/gedu/clubs/[id]`, `/gedu/camps/[id]`, `/gedu/events/[id]`) render
 * the same page; the prefix matches the gedu's mental model of what they're
 * about to teach. Consumer + municipality clubs collapse into `/clubs/`.
 */
function geduAssignedProductHref(
  productType: ProductType,
  productId: string,
): string {
  switch (productType) {
    case "consumer_club":
    case "municipality_club":
      return `/gedu/clubs/${productId}`;
    case "camp":
      return `/gedu/camps/${productId}`;
    case "event":
      return `/gedu/events/${productId}`;
  }
}

/**
 * Picks the admin product-details URL from a product's type. Unlike the gedu
 * routes, each product type has its own admin surface, so consumer and
 * municipality clubs do NOT collapse — they map to distinct edit pages
 * (`/admin/consumer-clubs/[id]` vs `/admin/municipality-clubs/[id]`). Used to
 * link a gamer's/parent's assigned products from the admin user-detail page.
 * The legacy `/admin/products/[id]` surface is dead (see TODO.md) — never target it.
 */
function adminProductHref(
  productType: ProductType,
  productId: string,
): string {
  switch (productType) {
    case "consumer_club":
      return `/admin/consumer-clubs/${productId}`;
    case "municipality_club":
      return `/admin/municipality-clubs/${productId}`;
    case "camp":
      return `/admin/camps/${productId}`;
    case "event":
      return `/admin/events/${productId}`;
  }
}

/** Centralized route paths — import and reference instead of hardcoding string literals. */
export const ROUTES = {
  home: "/",
  shop: "/shop",
  clubs: "/clubs",
  camps: "/camps",
  events: "/events",
  yty: "/#yty",
  about: "/#about",
  docs: "/docs",
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  // Landing page for the parent-PIN reset email link. Public (no session): the
  // user arrives from their inbox carrying a standalone signed token in a
  // `?token=` query param (NOT a Supabase recovery hash like resetPassword). The
  // token is single-use — bound to the current PIN hash; see pin-session.ts.
  resetPin: "/reset-pin",
  setupAccount: "/setup-account",
  selectProfile: "/select-profile",
  help: "/help",
  privacy: "/privacy",
  settings: "/settings",
  /**
   * Voice rooms. Two shapes share the `/voice` prefix:
   * - `forCode(code)` → `/voice/<code>` — public on-the-fly instant rooms,
   *   share-via-link by design (see docs/instant-voice-rooms.md).
   * - `groupSession(groupId)` → `/voice/group/<id>` — authenticated group
   *   voice room used by gamers (as participants) and gedus/admins (as
   *   moderators); the page authorizes by role + product assignment via
   *   `/api/voice/token`. The proxy gates this branch behind auth even
   *   though the rest of `/voice/*` is public — it imports
   *   `groupSessionPrefix` so the carve-out can't drift from the route.
   * `prefix` is the route base used for proxy matching.
   */
  voice: {
    prefix: "/voice",
    forCode: (code: string) => `/voice/${code}`,
    groupSessionPrefix: "/voice/group/",
    groupSession: (groupId: string) => `/voice/group/${groupId}`,
  },
  admin: {
    dashboard: "/admin",
    users: "/admin/users",
    usersAdd: "/admin/users/add",
    user: (id: string) => `/admin/users/${id}`,
    product: adminProductHref,
    consumerClubs: "/admin/consumer-clubs",
    consumerClubsNew: "/admin/consumer-clubs/new",
    municipalityClubs: "/admin/municipality-clubs",
    municipalityClubsNew: "/admin/municipality-clubs/new",
    camps: "/admin/camps",
    campsNew: "/admin/camps/new",
    events: "/admin/events",
    eventsNew: "/admin/events/new",
    voice: "/admin/voice",
    uiComponents: "/admin/ui-components",
    testing: "/admin/testing",
    whatsapp: "/admin/whatsapp",
    locations: "/admin/locations",
  },
  customer: {
    dashboard: "/parent",
    gamers: "/parent/gamers",
    // Lock gate: a customer session is redirected here until the parent PIN is
    // entered (see src/proxy.ts and docs/parent-pin-architecture.md).
    unlock: "/parent/unlock",
    // Authenticated "Change PIN" flow, reached from the settings security card.
    // Gated like the rest of /parent — only an unlocked customer can reach it.
    changePin: "/parent/change-pin",
  },
  gamer: {
    dashboard: "/gamer",
  },
  gedu: {
    dashboard: "/gedu",
    assignedProduct: geduAssignedProductHref,
  },
} as const;
