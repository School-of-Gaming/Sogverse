import type { Database } from "@/types/database.types";

type ProductTypeV2 = Database["public"]["Enums"]["product_type_v2"];

/**
 * Picks the gedu session-details URL prefix from a product's type. All three
 * routes (`/gedu/clubs/[id]`, `/gedu/camps/[id]`, `/gedu/events/[id]`) render
 * the same page; the prefix matches the gedu's mental model of what they're
 * about to teach. Consumer + municipality clubs collapse into `/clubs/`.
 */
function geduAssignedProductHref(
  productType: ProductTypeV2,
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
  setupAccount: "/setup-account",
  selectProfile: "/select-profile",
  help: "/help",
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
    products: "/admin/products",
    productsAdd: "/admin/products/add",
    product: (id: string) => `/admin/products/${id}`,
    productEdit: (id: string) => `/admin/products/${id}/edit`,
    productClone: (id: string) => `/admin/products/add?clone=${id}`,
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
    group: (groupId: string, gamerId?: string) =>
      gamerId
        ? `/parent/groups/${groupId}?gamer=${gamerId}`
        : `/parent/groups/${groupId}`,
  },
  gamer: {
    dashboard: "/gamer",
    groups: "/gamer/groups",
    group: (groupId: string) => `/gamer/groups/${groupId}`,
  },
  gedu: {
    dashboard: "/gedu",
    assignedProduct: geduAssignedProductHref,
  },
} as const;
