import type { Database } from "@/types/database.types";
import type { getPathname } from "@/i18n/navigation";

type ProductType = Database["public"]["Enums"]["product_type"];

/**
 * Any href the app's navigation APIs accept: an internal pathname with no
 * params, or an object naming one plus its `params` and `query`. Intermediate
 * data structures that carry a destination (a dashboard row, a fixture, a
 * card's detail link) hold this rather than a string.
 *
 * Taken from `getPathname`'s parameter rather than `Link`'s prop, because the
 * two differ: `Link` additionally accepts the whole of Node's `UrlObject`
 * (a `hash`, a nullable `query`), which `getPathname` does not. The narrower
 * type is assignable to the wider one, so one value serves both — and the
 * hash-bearing targets this excludes are handled at their call sites anyway,
 * since a fragment is not part of a route.
 */
export type AppHref = Parameters<typeof getPathname>[0]["href"];

/**
 * The object half of `AppHref`. Helpers that add a query to a destination they
 * were handed take this: a bare string href names a route with no params, and
 * spreading a query onto it is the same operation either way — but only the
 * object form can be spread without losing which route it was.
 */
export type AppHrefObject = Exclude<AppHref, string>;

/**
 * A route that takes no params, so its href *is* its pathname. It is the one
 * form usable as both a typed href and an ordinary string — which is what a
 * nav item needs, since the same value is rendered as a link and compared
 * against the current pathname.
 */
export type StaticAppHref = Extract<AppHref, string>;

/**
 * The href a link renders when there is nowhere to go — an in-person product's
 * Join button, a roll-up row whose room could not be resolved. It is a bare
 * fragment, so it is not a route and cannot be localized: a call site holding
 * one renders a plain anchor that cancels its own click, rather than handing
 * `"#"` to the wrapped `Link` and hoping it passes through.
 */
export const INERT_HREF = "#";

/** A destination that may be the inert `#` — see `INERT_HREF`. */
export type MaybeInertHref = AppHref | typeof INERT_HREF;

/**
 * The same, restricted to the object form — for a link that adds a query to
 * whatever destination it was handed (the voice Join's `?back=`).
 */
export type MaybeInertHrefObject = AppHrefObject | typeof INERT_HREF;

// ---------------------------------------------------------------------------
// The dual-form convention
// ---------------------------------------------------------------------------
//
// **The object form is canonical and keeps the builder's name.** next-intl
// types a wrapped `Link`'s href against the pathnames map's keys, and a dynamic
// route has to be passed as `{ pathname, params }` rather than a built string —
// which is exactly what makes the compiler surface a missed call site instead
// of shipping a `[id]` in someone's address bar. A builder that used to bake a
// query string into its return value carries it as the href object's separate
// `query` field.
//
// **String variants carry a `Path` suffix and exist only where a string is
// genuinely needed** — an absolute URL built server-side for an email or for
// Stripe, a `window.location` assignment, a value compared against a route
// shape. Those consumers cannot take an href object, and giving them one would
// mean re-deriving the path at the call site.
//
// **The Stripe success-URL builder stays string-only forever**: it embeds
// Stripe's literal `{CHECKOUT_SESSION_ID}` placeholder, which must never pass
// through a locale-aware path builder.


/**
 * Picks the gedu session-details URL prefix from a product's type. All three
 * routes (`/gedu/clubs/[id]`, `/gedu/camps/[id]`, `/gedu/events/[id]`) render
 * the same page; the prefix matches the gedu's mental model of what they're
 * about to teach. Consumer + municipality clubs collapse into `/clubs/`.
 */
function geduProductSegment(productType: ProductType): "clubs" | "camps" | "events" {
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

// Every builder below answers with a `switch` returning one whole href object
// per branch, rather than by indexing a segment → pathname map. The map form
// produces `{ pathname: A | B | C; params }`, which is not the same type as
// `{ pathname: A; params } | { pathname: B; params } | …` and cannot be handed
// to a route-typed `Link`: the href union correlates each pathname with the
// params that route actually declares, and a widened pathname loses exactly
// that correlation.
function geduAssignedProductHref(productType: ProductType, productId: string) {
  const params = { id: productId };
  switch (geduProductSegment(productType)) {
    case "clubs":
      return { pathname: "/gedu/clubs/[id]", params } as const;
    case "camps":
      return { pathname: "/gedu/camps/[id]", params } as const;
    case "events":
      return { pathname: "/gedu/events/[id]", params } as const;
  }
}

/** The string form, for the absolute URLs the session-report mail builds. */
function geduAssignedProductPath(
  productType: ProductType,
  productId: string,
): string {
  return `/gedu/${geduProductSegment(productType)}/${productId}`;
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
function familyEnrollmentSegment(
  productType: ProductType,
): "clubs" | "camps" | "events" {
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
) {
  const params = { id: participationId };
  const segment = familyEnrollmentSegment(productType);
  if (root === "/parent") {
    switch (segment) {
      case "clubs":
        return { pathname: "/parent/clubs/[id]", params } as const;
      case "camps":
        return { pathname: "/parent/camps/[id]", params } as const;
      case "events":
        return { pathname: "/parent/events/[id]", params } as const;
    }
  }
  switch (segment) {
    case "clubs":
      return { pathname: "/gamer/clubs/[id]", params } as const;
    case "camps":
      return { pathname: "/gamer/camps/[id]", params } as const;
    case "events":
      return { pathname: "/gamer/events/[id]", params } as const;
  }
}

/** The string form, for the absolute URLs the session-report mail builds. */
function familyEnrollmentPath(
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
function publicProductHref(productId: string) {
  return { pathname: "/shop/[id]", params: { id: productId } } as const;
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
function shopBrowseHref(productType: ProductType) {
  switch (productType) {
    case "consumer_club":
      return { pathname: "/shop", query: { category: "clubs" } } as const;
    case "camp":
      return { pathname: "/shop", query: { category: "camps" } } as const;
    case "event":
      return { pathname: "/shop", query: { category: "events" } } as const;
    case "municipality_club":
      return { pathname: "/shop" } as const;
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
function adminProductSegment(productType: ProductType) {
  switch (productType) {
    case "consumer_club":
      return "consumer-clubs" as const;
    case "municipality_club":
      return "municipality-clubs" as const;
    case "camp":
      return "camps" as const;
    case "event":
      return "events" as const;
  }
}

function adminProductHref(productType: ProductType, productId: string) {
  const params = { id: productId };
  switch (adminProductSegment(productType)) {
    case "consumer-clubs":
      return { pathname: "/admin/consumer-clubs/[id]", params } as const;
    case "municipality-clubs":
      return { pathname: "/admin/municipality-clubs/[id]", params } as const;
    case "camps":
      return { pathname: "/admin/camps/[id]", params } as const;
    case "events":
      return { pathname: "/admin/events/[id]", params } as const;
  }
}

function adminProductEditHref(productType: ProductType, productId: string) {
  const params = { id: productId };
  switch (adminProductSegment(productType)) {
    case "consumer-clubs":
      return { pathname: "/admin/consumer-clubs/[id]/edit", params } as const;
    case "municipality-clubs":
      return {
        pathname: "/admin/municipality-clubs/[id]/edit",
        params,
      } as const;
    case "camps":
      return { pathname: "/admin/camps/[id]/edit", params } as const;
    case "events":
      return { pathname: "/admin/events/[id]/edit", params } as const;
  }
}

function adminProductCloneHref(
  productType: ProductType,
  sourceProductId: string,
) {
  const query = { cloneFrom: sourceProductId };
  switch (adminProductSegment(productType)) {
    case "consumer-clubs":
      return { pathname: "/admin/consumer-clubs/new", query } as const;
    case "municipality-clubs":
      return { pathname: "/admin/municipality-clubs/new", query } as const;
    case "camps":
      return { pathname: "/admin/camps/new", query } as const;
    case "events":
      return { pathname: "/admin/events/new", query } as const;
  }
}

function adminProductGroupHref(
  productType: ProductType,
  productId: string,
  groupId: string,
) {
  const params = { id: productId, groupId };
  switch (adminProductSegment(productType)) {
    case "consumer-clubs":
      return {
        pathname: "/admin/consumer-clubs/[id]/groups/[groupId]",
        params,
      } as const;
    case "municipality-clubs":
      return {
        pathname: "/admin/municipality-clubs/[id]/groups/[groupId]",
        params,
      } as const;
    case "camps":
      return { pathname: "/admin/camps/[id]/groups/[groupId]", params } as const;
    case "events":
      return {
        pathname: "/admin/events/[id]/groups/[groupId]",
        params,
      } as const;
  }
}

/** The string form, for the absolute URLs the notification mails build. */
function adminProductPath(productType: ProductType, productId: string): string {
  return `/admin/${adminProductSegment(productType)}/${productId}`;
}

/**
 * A product type's admin listing and create form — the two of its surfaces that
 * take no params, so a plain pathname is the whole href.
 *
 * They used to be built at their call sites from the product-type config's
 * `routeSlug`, which produced a `/admin/${slug}/…` template string the router
 * can no longer be handed: a typed href names a declared route, and a
 * concatenated segment names none.
 */
const ADMIN_PRODUCT_LIST_PATHNAMES = {
  "consumer-clubs": "/admin/consumer-clubs",
  "municipality-clubs": "/admin/municipality-clubs",
  camps: "/admin/camps",
  events: "/admin/events",
} as const;

const ADMIN_PRODUCT_NEW_PATHNAMES = {
  "consumer-clubs": "/admin/consumer-clubs/new",
  "municipality-clubs": "/admin/municipality-clubs/new",
  camps: "/admin/camps/new",
  events: "/admin/events/new",
} as const;

/** Centralized route paths — import and reference instead of hardcoding string literals. */
export const ROUTES = {
  home: "/",
  shop: "/shop",
  /** Public storefront product-detail URL (`/shop/[id]`, any product type). */
  shopProduct: publicProductHref,
  /** The string form, for absolute URLs built server-side (Stripe, email). */
  shopProductPath: (productId: string) => `/shop/${productId}`,
  /**
   * Post-signup confirmation page, keyed by a participation that already
   * exists — free events, municipality registrations, and waitlist joins. The
   * static `/shop/confirmation` segment outranks the `/shop/[id]` dynamic
   * route in the App Router, so the opaque product ids it serves never collide.
   */
  shopConfirmation: (participationId: string) =>
    ({ pathname: "/shop/confirmation", query: { p: participationId } }) as const,
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
  /**
   * Landing page for the email-verification link. Public and session-agnostic:
   * the signed `?token=` carried from the recipient's inbox IS the
   * authorization, so the page must render the same for a signed-in reader, a
   * signed-out one, and a locked parent (it is PIN-exempt in the proxy for
   * exactly that reason — a parent clicking the link on their phone would
   * otherwise be bounced to the PIN pad and never verify).
   */
  verifyEmail: "/verify-email",
  /**
   * Landing page for the seat-offer email link. Public and session-agnostic for
   * the same reason `verifyEmail` is, with one extra: the person clicking is a
   * parent on a family device, so they may well be signed in as their own
   * child. The signed `?token=` names the offer and IS the authorization, and
   * an auth-gated route would bounce that reader somewhere before the token was
   * ever read.
   *
   * Unlike `verifyEmail`, nothing here acts on the GET. Accepting a seat is not
   * idempotent and it grants something, so the page only renders and the two
   * answers are POSTs behind buttons — an inbox scanner following the link must
   * never take a seat on a family's behalf.
   */
  seatOffer: "/seat-offer",
  selectProfile: "/select-profile",
  /**
   * Public identity page — who School of Gaming is, what Yty is, and the
   * public FAQ. Reached from the header in both auth states: it is the one
   * page carrying this copy, and the home page it used to live on is
   * unreachable for a signed-in reader (the proxy bounces `/` to their
   * dashboard).
   *
   * Deliberately **not** PIN-exempt: a locked customer session meets the
   * parent-PIN pad here exactly as it does at `/shop`.
   */
  about: "/about",
  /** Public municipality-club discovery page — list + search of Finnish municipalities. */
  schools: "/schools",
  /**
   * Per-municipality schools page, keyed by a name slug (`municipalitySlug`),
   * e.g. `/schools/helsinki`. Resolves the canonical and every alternate-locale
   * slug back to the same municipality (see `findMunicipalityBySlug`).
   */
  schoolMunicipality: (slug: string) =>
    ({
      pathname: "/schools/[municipalityName]",
      params: { municipalityName: slug },
    }) as const,
  /**
   * A municipality club's detail page reached from its `/schools/<slug>`
   * listing — same detail UI as `/shop/[id]`, but nested under the slug so the
   * back link can return to that municipality. Build the href with the slug the
   * user is currently on (the URL param), not the canonical one, so the child
   * URL stays in the same slug namespace as its parent.
   */
  /**
   * The string form. The one consumer is the admin panel's shareable public
   * URL, which is copied out of the product and sent to a family — so it stays
   * a **bare** path deliberately: prefixed with the admin's own locale it would
   * pin their language onto whoever opens it, where a bare path runs the
   * recipient's own ladder.
   */
  schoolMunicipalityProductPath: (slug: string, productId: string) =>
    `/schools/${slug}/${productId}`,
  schoolMunicipalityProduct: (slug: string, productId: string) =>
    ({
      pathname: "/schools/[municipalityName]/[id]",
      params: { municipalityName: slug, id: productId },
    }) as const,
  /**
   * Public landing page for the Roblox Studio programme — run with our partner
   * Lynx Educate, in collaboration with Roblox — running in France. Placeholder
   * content while the programme is being finalised: reachable by anyone who has
   * the URL (so it can be shared with Lynx and Roblox) but deliberately
   * undiscoverable — no nav link, excluded from the
   * sitemap, and noindex via its own metadata. NOT disallowed in robots.txt,
   * on purpose: a disallowed URL is never crawled, so the noindex tag would
   * never be read and the bare URL could still be indexed off an external
   * link (the page's own metadata comment explains the same). Flip the nav,
   * sitemap and noindex together when the content is ready to be found.
   */
  roblox: "/roblox",
  /**
   * The Programme's own slice of the storefront: Roblox Studio products
   * delivered in French. This is where every "register" / "get started" CTA on
   * `/roblox` lands — the programme has no storefront of its own, so the shop
   * filtered down to it *is* its catalogue, and the same URL is shared by the
   * hero and the closing CTA so both promise the same page.
   *
   * The `topic` and `lang` param names, and their comma-separated list
   * grammar, are the browse-filter hook's (`use-browse-filters.ts`); the values
   * are the `product_topic` and `spoken_language` enums' own. Keep the two in
   * sync — same arrangement as `shopBrowse` and the `category` param above. An
   * unrecognised value there reads as no selection rather than an empty grid,
   * so a stale link degrades to a wider shop rather than to nothing.
   */
  robloxShop: {
    pathname: "/shop",
    query: { topic: "roblox_studio", lang: "fr" },
  },
  /**
   * The parent-facing half of the same slice — French-language products whose
   * audience is parents rather than their teens, which is what the programme's
   * digital-safety sessions for parents are. Deliberately not topic-filtered:
   * a parent session is about online safety, not about Roblox Studio.
   */
  robloxParentSessions: {
    pathname: "/shop",
    query: { lang: "fr", audience: "parents" },
  },
  /**
   * The Programme's own privacy policy, supplementing the platform one at
   * `/privacy`. Shares `/roblox`'s unpublished posture exactly — noindex, no
   * sitemap entry, no nav link, reachable only from `/roblox` itself — and
   * flips to published in the same change that publishes `/roblox`.
   */
  robloxPrivacy: "/roblox/privacy",
  /**
   * The Programme's joint child safeguarding policy, held by Lynx Educate and
   * School of Gaming together. Same posture as `robloxPrivacy` above — noindex,
   * no sitemap entry, no nav link, reachable only from `/roblox` itself — and
   * flips to published in the same change that publishes `/roblox`.
   */
  robloxSafeguarding: "/roblox/safeguarding",
  /**
   * The Programme's own terms, supplementing the platform ones at
   * `/terms-and-conditions`. Same posture as `robloxPrivacy` above — noindex,
   * no sitemap entry, no nav link, reachable only from `/roblox` itself — and
   * flips to published in the same change that publishes `/roblox`.
   */
  robloxTerms: "/roblox/terms",
  privacy: "/privacy",
  termsAndConditions: "/terms-and-conditions",
  antiBullying: "/anti-bullying-and-discipline",
  /**
   * Every credit the product owes — the data sources behind the location tree
   * and the services that render game-account art. Linked from the footer's
   * legal row and published like the pages beside it (indexed, in the sitemap):
   * it is site-wide compliance, not part of any one programme.
   */
  attributions: "/attributions",
  settings: "/settings",
  /**
   * Voice rooms. Two shapes share the `/voice` prefix:
   * - `forCode(code)` → `/voice/<code>` — public on-the-fly instant rooms,
   *   share-via-link by design (see src/components/voice/instant/CLAUDE.md).
   * - `groupSession(groupId)` → `/voice/group/<id>` — authenticated group
   *   voice room used by seat-holders (a gamer, or a parent on their own
   *   seat) as participants and gedus/admins as moderators; the page does no
   *   authorization of its own — membership and moderator rights are decided
   *   by `/api/voice/token`. The proxy gates this branch behind auth even
   *   though the rest of `/voice/*` is public — it imports
   *   `groupSessionPrefix` so the carve-out can't drift from the route.
   * `prefix` is the route base used for proxy matching.
   */
  voice: {
    prefix: "/voice",
    forCode: (code: string) =>
      ({ pathname: "/voice/[code]", params: { code } }) as const,
    /** The string form — the shareable room URL a chip copies to the clipboard. */
    forCodePath: (code: string) => `/voice/${code}`,
    groupSessionPrefix: "/voice/group/",
    groupSession: (groupId: string) =>
      ({ pathname: "/voice/group/[id]", params: { id: groupId } }) as const,
  },
  admin: {
    dashboard: "/admin",
    users: "/admin/users",
    user: (id: string) =>
      ({ pathname: "/admin/users/[id]", params: { id } }) as const,
    /** The string form, for absolute URLs built server-side (email). */
    userPath: (id: string) => `/admin/users/${id}`,
    product: adminProductHref,
    /** The string form, for absolute URLs built server-side (email). */
    productPath: adminProductPath,
    /** A product type's admin listing (`/admin/camps`). */
    productList: (productType: ProductType) =>
      ADMIN_PRODUCT_LIST_PATHNAMES[adminProductSegment(productType)],
    /** The create form for a product type (`/admin/camps/new`). */
    productNew: (productType: ProductType) =>
      ADMIN_PRODUCT_NEW_PATHNAMES[adminProductSegment(productType)],
    /** The edit form for one product. */
    productEdit: adminProductEditHref,
    /** The create form, seeded from an existing product. */
    productClone: adminProductCloneHref,
    /** One group's detail page under its product. */
    productGroup: adminProductGroupHref,
    consumerClubs: "/admin/consumer-clubs",
    municipalityClubs: "/admin/municipality-clubs",
    camps: "/admin/camps",
    events: "/admin/events",
    /**
     * Every site on the platform — the `site` rows of the location tree, listed
     * and edited as things in their own right rather than as a field on
     * whichever product happens to run there.
     *
     * Sites are still *created* from a product's site picker and nowhere else,
     * which is why there is no "new site" route here: a site exists to be
     * pointed at, and the flow that needs one is the flow that names it.
     */
    sites: "/admin/sites",
    site: (id: string) =>
      ({ pathname: "/admin/sites/[id]", params: { id } }) as const,
    /**
     * Platform-operations tools that belong to no one product — the instant
     * voice room and the Minecraft Education password reset, both shared by
     * admins and certified gedus. The gedu half lives on their dashboard's
     * Tools section rather than at a URL of its own; a gedu has no sidebar to
     * reach one with. `/admin/voice` used to hold the room card and now only
     * redirects here.
     */
    tools: "/admin/tools",
    uiComponents: "/admin/ui-components",
    uiPreviews: "/admin/ui-previews",
    testing: "/admin/testing",
    whatsapp: "/admin/whatsapp",
  },
  customer: {
    dashboard: "/parent",
    /**
     * One child's page under the parent root. There is no `/parent/gamers`
     * index — the parent dashboard is that list — so this is a builder rather
     * than a prefix a call site appends an id to.
     */
    gamer: (gamerId: string) =>
      ({ pathname: "/parent/gamers/[id]", params: { id: gamerId } }) as const,
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
    /** The string form, for absolute URLs built server-side (email). */
    enrollmentPath: (productType: ProductType, participationId: string) =>
      familyEnrollmentPath("/parent", productType, participationId),
  },
  gamer: {
    dashboard: "/gamer",
    /** The same page in the child's own root — their copy of one enrollment. */
    enrollment: (productType: ProductType, participationId: string) =>
      familyEnrollmentHref("/gamer", productType, participationId),
    /** The string form, for absolute URLs built server-side (email). */
    enrollmentPath: (productType: ProductType, participationId: string) =>
      familyEnrollmentPath("/gamer", productType, participationId),
  },
  gedu: {
    dashboard: "/gedu",
    /** The terms a Game Educator works under, and where they are accepted. */
    contract: "/gedu/contract",
    assignedProduct: geduAssignedProductHref,
    /** The string form, for absolute URLs built server-side (email). */
    assignedProductPath: geduAssignedProductPath,
  },
} as const;
