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
 * The URL segment a family's enrollment page sits under, from the product's
 * type — the family analogue of the gedu prefix above, and the same collapse:
 * consumer and municipality clubs are both "clubs" to the people in them.
 *
 * Shared by both roles, because the taxonomy is a fact about the product rather
 * than about who is reading it. All that differs is the role root, which is why
 * the two `ROUTES` entries below are separate rather than one taking a role.
 */
function familyEnrollmentSegment(productType: ProductType): string {
  switch (productType) {
    case "consumer_club":
    case "municipality_club":
      return "clubs";
    case "camp":
      return "camps";
    case "event":
      return "events";
  }
}

/**
 * A family's page for **one enrollment**, under the given role root.
 *
 * **Keyed by participation id, not product id** — the load-bearing difference
 * from every other product href in this file. A family product page is
 * gamer-scoped: two siblings in one club get two pages, because everything the
 * page carries (attendance today, per-child notes tomorrow) is per-child. The
 * participation row *is* the (gamer × product) pair, so it is the only id that
 * names the page unambiguously — and it is what the dashboard card already
 * holds.
 *
 * Only a **placed** enrollment has a page behind this URL. A waitlist place and
 * an unplaced seat have no group, so they have no feed and nothing to render;
 * both render no link at all rather than one landing on a not-found card.
 */
function familyEnrollmentHref(
  root: "/parent" | "/gamer",
  productType: ProductType,
  participationId: string,
): string {
  return `${root}/${familyEnrollmentSegment(productType)}/${participationId}`;
}

/**
 * Public storefront detail URL for a product. A single `/shop/[id]` route
 * serves every product type — the page derives the type from the fetched row.
 * The URL ends in an opaque product id, so a per-type segment (`/shop/clubs/…`)
 * would add nesting without improving readability; keep it flat.
 */
function publicProductHref(productId: string): string {
  return `/shop/${productId}`;
}

/**
 * Public storefront browse URL for a product's type — the "back to listing"
 * target from a detail page. Lands on `/shop` with the matching category
 * pre-selected; the shop's Type filter is a multi-select, so this single value
 * reads there as a selection of one. The `category` query param name and values
 * mirror `shop-categories.ts` (the parser) — keep the two in sync.
 *
 * `municipality_club` is the one type the shop doesn't surface, so it falls back
 * to the bare `/shop`. A muni club opened from its `/schools/<slug>` listing
 * overrides the back link to return there (see the municipality branch in
 * `product-detail-page-body.tsx`); this fallback only applies to a muni club
 * reached by a bare `/shop/<id>` link with no municipality context.
 */
function shopBrowseHref(productType: ProductType): string {
  switch (productType) {
    case "consumer_club":
      return "/shop?category=clubs";
    case "camp":
      return "/shop?category=camps";
    case "event":
      return "/shop?category=events";
    case "municipality_club":
      return "/shop";
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
  /** Public storefront product-detail URL (`/shop/[id]`, any product type). */
  shopProduct: publicProductHref,
  /**
   * Post-signup confirmation page, keyed by a participation that already
   * exists — free events, municipality registrations, and waitlist joins. The
   * static `/shop/confirmation` segment outranks the `/shop/[id]` dynamic
   * route in the App Router, so the opaque product ids it serves never collide.
   */
  shopConfirmation: (participationId: string) =>
    `/shop/confirmation?p=${participationId}`,
  /**
   * The same page for a paid signup, keyed by the Stripe Checkout Session
   * instead. A paid participation is created only once payment is confirmed, so
   * there is no participation id to put in `success_url` at the moment the
   * session is built — the session id is the only handle that exists then, and
   * the page resolves it back to the row. Build the `success_url` with Stripe's
   * literal `{CHECKOUT_SESSION_ID}` placeholder, which Stripe substitutes on
   * redirect.
   */
  shopPaidConfirmation: (sessionId: string) =>
    `/shop/confirmation?session_id=${sessionId}`,
  /** "Back to listing" URL — `/shop` with the type's category pre-selected. */
  shopBrowse: shopBrowseHref,
  yty: "/#yty",
  about: "/#about",
  docs: "/docs",
  login: "/login",
  register: "/register",
  /** Public gedu self-registration page (the gedu analogue of /register). */
  registerGedu: "/register-gedu",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  // Landing page for the parent-PIN reset email link. Public (no session): the
  // user arrives from their inbox carrying a standalone signed token in a
  // `?token=` query param (NOT a Supabase recovery hash like resetPassword). The
  // token is single-use — bound to the current PIN hash; see pin-session.ts.
  resetPin: "/reset-pin",
  selectProfile: "/select-profile",
  help: "/help",
  /** Public municipality-club discovery page — list + search of Finnish municipalities. */
  schools: "/schools",
  /**
   * Per-municipality schools page, keyed by a name slug (`municipalitySlug`),
   * e.g. `/schools/helsinki`. Resolves the canonical and every alternate-locale
   * slug back to the same municipality (see `findMunicipalityBySlug`).
   */
  schoolMunicipality: (slug: string) => `/schools/${slug}`,
  /**
   * A municipality club's detail page reached from its `/schools/<slug>`
   * listing — same detail UI as `/shop/[id]`, but nested under the slug so the
   * back link can return to that municipality. Build the href with the slug the
   * user is currently on (the URL param), not the canonical one, so the child
   * URL stays in the same slug namespace as its parent.
   */
  schoolMunicipalityProduct: (slug: string, productId: string) =>
    `/schools/${slug}/${productId}`,
  /**
   * Public landing page for the Roblox Studio partnership with Lynx Educate,
   * running in France. Placeholder content while the partnership is being
   * finalised: reachable by anyone who has the URL (so it can be shared with
   * partners) but deliberately undiscoverable — no nav link, excluded from the
   * sitemap, disallowed in robots.txt, and noindex via its own metadata.
   * Flip all four together when the content is ready to be found.
   */
  roblox: "/roblox",
  privacy: "/privacy",
  termsAndConditions: "/terms-and-conditions",
  antiBullying: "/anti-bullying-and-discipline",
  settings: "/settings",
  /**
   * Voice rooms. Two shapes share the `/voice` prefix:
   * - `forCode(code)` → `/voice/<code>` — public on-the-fly instant rooms,
   *   share-via-link by design (see src/components/voice/instant/CLAUDE.md).
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
    uiPreviews: "/admin/ui-previews",
    testing: "/admin/testing",
    whatsapp: "/admin/whatsapp",
  },
  customer: {
    dashboard: "/parent",
    gamers: "/parent/gamers",
    // Lock gate: a customer session is redirected here until the parent PIN is
    // entered (see src/proxy.ts and src/services/pin/CLAUDE.md).
    unlock: "/parent/unlock",
    // Authenticated "Change PIN" flow, reached from the settings security card.
    // Gated like the rest of /parent — only an unlocked customer can reach it.
    changePin: "/parent/change-pin",
    /**
     * The parent's page for one of their children's enrollments
     * (`/parent/{clubs,camps,events}/[participationId]`). See
     * `familyEnrollmentHref` for why it is keyed by participation.
     */
    enrollment: (productType: ProductType, participationId: string) =>
      familyEnrollmentHref("/parent", productType, participationId),
  },
  gamer: {
    dashboard: "/gamer",
    /** The same page in the child's own root — their copy of one enrollment. */
    enrollment: (productType: ProductType, participationId: string) =>
      familyEnrollmentHref("/gamer", productType, participationId),
  },
  gedu: {
    dashboard: "/gedu",
    assignedProduct: geduAssignedProductHref,
  },
} as const;
