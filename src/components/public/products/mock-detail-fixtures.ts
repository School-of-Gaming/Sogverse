import type {
  BrowseRowLocation,
  ProductLongDescription,
  ProductType,
} from "@/types";
import { SUPPORTED_CURRENCIES } from "@/lib/constants/currency";
import type { ProductDetailRow } from "@/services/products";
import {
  registrationCtaKind,
  type RegistrationCtaKind,
  type RegistrationState,
} from "./derive-registration-state";
import type { AuthState, MyParticipationState } from "./signup-panel-view";

// Synthetic fixtures, one per curated preview scenario. The mental model: each
// scenario IS a mocked product. The /admin/ui-components card and the
// /preview/products/[scenario] full page both just render that one mock — same
// product row, same registration state, same auth state — so the card and the
// page it links to can never disagree.
//
// The set is curated down to the *visually distinct* surfaces worth eyeballing,
// grouped by product type:
//   • Consumer club — a subscription club (open) + an ended product.
//   • Municipality club — the full seat-fill range, plus the pre-launch
//     countdown across the three auth states a parent can be in.
//   • Event — a free product.
//
// Most scenarios author their registration `state` directly so they stay
// deterministic regardless of the wall clock. The countdown scenarios are the
// exception: they carry an `opensInMs` offset and resolve a live `closed_pre`
// state at build time, so the clock actually ticks for an admin reviewing them.

export type PreviewScenario =
  | "consumer-club"
  | "muni-empty"
  | "muni-filling"
  | "muni-almost-full"
  | "muni-full-closed"
  | "muni-full-waitlist"
  | "muni-opens-10s"
  | "muni-opens-signed-out"
  | "muni-opens-no-gamers"
  | "muni-opens-with-gamers"
  | "camp-open"
  | "camp-running"
  | "free-event";

// Which signed-in shape the panel renders against. `signed-out` → the auth
// overlay (sign in / create account); `no-gamers` → a `ready` customer whose
// gamer picker is empty (just the "Add a child" row); `with-gamers` → a `ready`
// customer with the two demo children.
type AuthKind = "signed-in-with-gamers" | "signed-in-no-gamers" | "signed-out";

interface ScenarioBase {
  /** Short label shown above the demo card (the subsection carries the type). */
  label: string;
  productType: ProductType;
  billingMode: "paid" | "free" | "external_contract";
  /** Capacity on the product row. Drives the municipality seat-fill bar. */
  seatCount: number | null;
  waitlistEnabled: boolean;
  /**
   * EUR list price in cents — monthly for the subscription club, upfront for
   * camps/events. `null` for free / externally-funded products (no price rows).
   */
  priceCentsEur: number | null;
  auth: AuthKind;
  /**
   * Online municipality club: `is_remote` with a municipality-typed location
   * (no school site), so the card/detail render the "online — {city}" location
   * line instead of the in-person school. Only meaningful for muni clubs.
   */
  online?: boolean;
}

// A scenario either authors a static registration state, or is a live
// pre-launch countdown (resolved to `closed_pre` against `Date.now()` so the
// clock ticks).
type ScenarioConfig =
  | (ScenarioBase & { state: RegistrationState })
  | (ScenarioBase & { opensInMs: number });

// Real UUIDs so the gamer picker's identicons hash to distinct, stable avatars
// — placeholder ids like "g1" render degenerate identicons that misrepresent
// the real UI. The middle child (Väinö) already participates in the product;
// `buildAuthState` stamps the matching signup state (waitlisted vs. seat) so
// the picker shows the disabled "already signed up / waitlisted" row alongside
// two still-selectable siblings.
const DEMO_GAMERS = [
  { id: "6aaac864-5ea7-451b-8d02-93f9ae6f25b5", name: "Oona", age: 10 },
  { id: "decdae83-3f51-4209-bf1a-254e88f1c32f", name: "Väinö", age: 11 },
  { id: "d010872c-7034-401b-9c2d-5dfa675f60d8", name: "Aino", age: 8 },
] as const;

const NINETY_MIN_MS = 90 * 60 * 1000;
const TEN_SEC_MS = 10 * 1000;

const SCENARIOS: Record<PreviewScenario, ScenarioConfig> = {
  "consumer-club": {
    label: "€45/mo — open",
    productType: "consumer_club",
    billingMode: "paid",
    seatCount: null,
    waitlistEnabled: false,
    priceCentsEur: 4500,
    auth: "signed-in-with-gamers",
    state: {
      kind: "open",
      seatCount: null,
      seatsLeft: null,
      waitlistEnabled: false,
    },
  },
  "muni-empty": {
    label: "15 / 15 seats",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    state: { kind: "open", seatCount: 15, seatsLeft: 15, waitlistEnabled: false },
  },
  "muni-filling": {
    // The single 6/15 card doubles as the online-muni demo: it's remote and
    // references a municipality node, so it exercises the "online — {city}"
    // location line. The other muni cards stay in-person (a school site).
    label: "Online · 6 / 15 seats",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    online: true,
    state: { kind: "open", seatCount: 15, seatsLeft: 6, waitlistEnabled: false },
  },
  "muni-almost-full": {
    label: "2 / 15 seats",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    state: { kind: "open", seatCount: 15, seatsLeft: 2, waitlistEnabled: false },
  },
  "muni-full-closed": {
    label: "0 / 15 — no waitlist",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    state: { kind: "full_closed", seatCount: 15 },
  },
  "muni-full-waitlist": {
    label: "0 / 15 — waitlist",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: true,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    state: { kind: "full_waitlist", seatCount: 15 },
  },
  "muni-opens-10s": {
    label: "Opens in 10 seconds (live)",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    opensInMs: TEN_SEC_MS,
  },
  "muni-opens-signed-out": {
    label: "Opens in 90 min — signed out",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-out",
    opensInMs: NINETY_MIN_MS,
  },
  "muni-opens-no-gamers": {
    label: "Opens in 90 min — signed in, no gamers",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-no-gamers",
    opensInMs: NINETY_MIN_MS,
  },
  "muni-opens-with-gamers": {
    label: "Opens in 90 min — signed in, with gamers",
    productType: "municipality_club",
    billingMode: "external_contract",
    seatCount: 15,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    opensInMs: NINETY_MIN_MS,
  },
  "camp-open": {
    label: "Not started yet — €250",
    productType: "camp",
    billingMode: "paid",
    seatCount: null,
    waitlistEnabled: false,
    priceCentsEur: 25000,
    auth: "signed-in-with-gamers",
    state: {
      kind: "open",
      seatCount: null,
      seatsLeft: null,
      waitlistEnabled: false,
    },
  },
  "camp-running": {
    // Camps lock late joins once running — the card shows a disabled
    // "Already started" button, and there's no detail page to open.
    label: "Already started",
    productType: "camp",
    billingMode: "paid",
    seatCount: null,
    waitlistEnabled: false,
    priceCentsEur: 25000,
    auth: "signed-in-with-gamers",
    state: { kind: "running_late" },
  },
  "free-event": {
    label: "Free — open",
    productType: "event",
    billingMode: "free",
    seatCount: null,
    waitlistEnabled: false,
    priceCentsEur: null,
    auth: "signed-in-with-gamers",
    state: {
      kind: "open",
      seatCount: null,
      seatsLeft: null,
      waitlistEnabled: false,
    },
  },
};

// Render order for the UI Components grid. Explicit (rather than `Object.keys`)
// so the sequence is intentional, and grouped contiguously by product type so
// the subsections come out in this order.
const SCENARIO_ORDER: PreviewScenario[] = [
  "consumer-club",
  "muni-empty",
  "muni-filling",
  "muni-almost-full",
  "muni-full-closed",
  "muni-full-waitlist",
  "muni-opens-10s",
  "muni-opens-signed-out",
  "muni-opens-no-gamers",
  "muni-opens-with-gamers",
  "camp-open",
  "camp-running",
  "free-event",
];

// Subsection heading per product type (the type context the short labels omit).
const GROUP_LABELS: Record<ProductType, string> = {
  consumer_club: "Consumer club",
  municipality_club: "Municipality club",
  camp: "Camp",
  event: "Event",
};

// The list (with subsection grouping) the UI Components page iterates over.
export const PREVIEW_SCENARIOS: {
  slug: PreviewScenario;
  label: string;
  group: string;
}[] = SCENARIO_ORDER.map((slug) => ({
  slug,
  label: SCENARIOS[slug].label,
  group: GROUP_LABELS[SCENARIOS[slug].productType],
}));

export function isPreviewScenario(s: string): s is PreviewScenario {
  return s in SCENARIOS;
}

// CTA kind for a scenario without needing the wall clock — a countdown is
// always `closed_pre`, which is a primary "View" CTA.
function configCtaKind(c: ScenarioConfig): RegistrationCtaKind {
  return "opensInMs" in c ? "primary" : registrationCtaKind(c.state);
}

// Whether a scenario's card links into a full detail page. Only states whose
// browse-card CTA is a working "View" button do — a parent can never reach the
// detail page of a full/closed or ended product, so there's nothing to
// preview. The /preview route 404s the rest rather than mocking a page no one
// lands on. Single-sourced from `registrationCtaKind` so this never drifts from
// the actual card CTA.
export function scenarioHasDetailPage(slug: PreviewScenario): boolean {
  return configCtaKind(SCENARIOS[slug]) === "primary";
}

// Seats already taken on a scenario — the count the municipality seat-fill bar
// reads. Derived from the authored state so the bar and the card's state stay
// in lock-step. Countdown / no-cap scenarios read empty (no one has registered
// before registration opens).
export function scenarioFilledSeats(slug: PreviewScenario): number {
  const c = SCENARIOS[slug];
  if (c.seatCount === null || "opensInMs" in c) return 0;
  switch (c.state.kind) {
    case "open":
      return c.state.seatsLeft === null ? 0 : c.seatCount - c.state.seatsLeft;
    case "full_waitlist":
    case "full_closed":
      return c.seatCount;
    default:
      return 0;
  }
}

// Static reference instant for the dated fixtures (start_date, end_date,
// timestamps on the row). The countdown scenarios anchor their `opensAt` on
// `Date.now()` instead — see `buildScenarioFixture`.
const STATIC_REF_MS = Date.UTC(2026, 0, 5, 12, 0, 0); // Mon 5 Jan 2026, 12:00 UTC
const DAY_MS = 24 * 60 * 60 * 1000;

interface BuildFixtureResult {
  product: ProductDetailRow;
  state: RegistrationState;
  authState: AuthState;
}

export function buildScenarioFixture(slug: PreviewScenario): BuildFixtureResult {
  const config = SCENARIOS[slug];
  const detailHref = `/preview/products/${slug}`;

  let state: RegistrationState;
  let registrationOpensAt: string;
  if ("opensInMs" in config) {
    // Live countdown: opens a fixed offset ahead of *now* so the clock ticks.
    // The row's drop instant and the panel state share the same timestamp.
    const opensAt = new Date(Date.now() + config.opensInMs).toISOString();
    state = { kind: "closed_pre", opensAt };
    registrationOpensAt = opensAt;
  } else {
    state = config.state;
    // Already open (or ended) in every static scenario — the drop is in the past.
    registrationOpensAt = new Date(STATIC_REF_MS - DAY_MS).toISOString();
  }

  const product = buildBaseProduct(slug, config, registrationOpensAt, state);
  const authState = buildAuthState(config.auth, detailHref, state);
  return { product, state, authState };
}

function buildAuthState(
  auth: AuthKind,
  detailHref: string,
  state: RegistrationState,
): AuthState {
  switch (auth) {
    case "signed-out": {
      const redirect = `?redirect=${encodeURIComponent(detailHref)}`;
      return {
        kind: "unauthenticated",
        signInHref: `/login${redirect}`,
        createAccountHref: `/register${redirect}`,
      };
    }
    case "signed-in-no-gamers":
      return { kind: "ready", gamers: [] };
    case "signed-in-with-gamers": {
      // The middle child already participates — on a full product with a
      // waitlist they hold a waitlist spot; otherwise they hold a seat.
      const signupState: MyParticipationState =
        state.kind === "full_waitlist" ? "waitlisted" : "active";
      return {
        kind: "ready",
        gamers: [
          DEMO_GAMERS[0],
          { ...DEMO_GAMERS[1], signupState },
          DEMO_GAMERS[2],
        ],
      };
    }
  }
}

// ---------- Base product shape ----------

function buildBaseProduct(
  slug: PreviewScenario,
  config: ScenarioConfig,
  registrationOpensAt: string,
  state: RegistrationState,
): ProductDetailRow {
  const { productType, billingMode } = config;
  const copy = COPY[productType];
  const { startDate, endDate, scheduleSlots } = pickSchedule(productType);
  // Online muni clubs are remote and reference a municipality node (not a
  // school site); everything else keeps its per-type location + remoteness.
  const isOnlineMuni = config.online === true;
  const isRemote = isOnlineMuni ? true : copy.isRemote;
  const locationFixture = isOnlineMuni
    ? MOCK_LOC_ESPOO_MUNI
    : pickLocationFixture(productType);

  // Metadata the database would otherwise populate (created_at/updated_at,
  // created_by) gets static demo values so the fixture is a complete,
  // honestly-typed ProductDetailRow — no casts.
  const refTimestamp = new Date(STATIC_REF_MS - 30 * DAY_MS).toISOString();

  const id = `mock-${slug}`;

  return {
    id,
    product_type: productType,
    billing_mode: billingMode,
    status: pickStatus(state),
    is_visible: true,
    is_remote: isRemote,
    min_age: 8,
    max_age: 12,
    spoken_language_code: "fi",
    location_id: locationFixture?.id ?? null,
    locations: locationFixture,
    padlet_url: null,
    signup_threshold: null,
    start_date: startDate,
    end_date: endDate,
    timezone: "Europe/Helsinki",
    seat_count: config.seatCount,
    waitlist_enabled: config.waitlistEnabled,
    registration_opens_at: registrationOpensAt,
    image_path: null,
    // Fixed product_topic enum; the label is resolved via PRODUCT_TOPICS, so
    // the value just needs to be valid. Events get Fortnite, the rest
    // Minecraft Java.
    topic: productType === "event" ? "fortnite" : "minecraft_java",
    refund_policy_days: null,
    primary_gedu_fee_cents: null,
    assistant_gedu_fee_cents: null,
    municipality_fee_cents: null,
    created_at: refTimestamp,
    updated_at: refTimestamp,
    created_by: "mock-admin",
    product_translations: [
      {
        locale: "en",
        name: copy.name,
        short_description: copy.description,
        long_description: copy.long ?? null,
        product_id: id,
        created_at: refTimestamp,
        updated_at: refTimestamp,
      },
    ],
    product_prices:
      config.priceCentsEur === null
        ? []
        : buildPriceRows(id, config.priceCentsEur),
    schedule_slots: scheduleSlots,
    holidays: pickHolidays(productType),
  };
}

// ---------- Per-type narrative copy ----------

interface TypeCopy {
  name: string;
  description: string;
  /** Optional structured long description — exercises the detail-page card. */
  long?: ProductLongDescription;
  isRemote: boolean;
}

const COPY: Record<ProductType, TypeCopy> = {
  consumer_club: {
    name: "Minecraft Redstone Club",
    description:
      "We build little machines together — doors that open on command, sorters, traps, small factories. A playful way to learn how circuits actually think.",
    long: [
      { type: "heading", text: "What happens each week" },
      {
        type: "paragraph",
        text: "Every session starts with a quick show-and-tell of what the group built last time, then we take on one new contraption together — a hidden door, an item sorter, an automatic farm.",
      },
      {
        type: "paragraph",
        text: "Gedus keep the pace gentle and hands-on. There's no winning or losing, just steady building and plenty of \"wait, how did you do that?\" moments.",
      },
      { type: "heading", text: "What your child takes away" },
      {
        type: "paragraph",
        text: "Logical thinking, a bit of patience, and the quiet confidence that comes from making a machine work. Friendships, too — the same gamers come back week after week.",
      },
    ],
    isRemote: true,
  },
  municipality_club: {
    name: "Espoon Minecraft-kerho",
    description:
      "Funded by the City of Espoo. Free for Espoo residents. Held weekly at Tapiolan koulu after school.",
    isRemote: false,
  },
  camp: {
    name: "Minecraft Builders Camp",
    description:
      "Three mornings a week for two weeks. Each session we take on a new build, and the group ends with a world everyone can explore together.",
    long: [
      { type: "heading", text: "How it runs" },
      {
        type: "paragraph",
        text: "We meet Monday, Wednesday, and Friday mornings across two weeks — enough rhythm to build something real without taking over the whole holiday.",
      },
      {
        type: "paragraph",
        text: "Each morning starts by looking at what the group made last time, then we take on one new build together — a redstone gadget, a themed house, a small adventure map.",
      },
      { type: "heading", text: "Who it's for" },
      {
        type: "paragraph",
        text: "Curious kids who love games and want to try making one. No prior experience needed — just a laptop and an account.",
      },
    ],
    isRemote: false,
  },
  event: {
    name: "Friday Night Mario Kart Tournament",
    description:
      "Bring your A-game. Bracket-style races, casual vibes, snacks provided. One night only.",
    isRemote: false,
  },
};

// ---------- Schedule ----------

function pickSchedule(productType: ProductType): {
  startDate: string;
  endDate: string;
  scheduleSlots: { weekday: number; start_time: string; duration_minutes: number }[];
} {
  switch (productType) {
    case "consumer_club":
    case "municipality_club":
      return {
        startDate: "2026-01-13",
        endDate: "2026-05-30",
        // Tuesday afternoons (weekday 1 = Tue under 0=Mon convention).
        scheduleSlots: [
          { weekday: 1, start_time: "15:30:00", duration_minutes: 90 },
        ],
      };
    case "camp":
      // Real camps run a few days a week, not all five — Mon/Wed/Fri mornings
      // across two weeks (weekday 0 = Mon). Start/end bracket the first and last
      // session so the date range and the calendar agree.
      return {
        startDate: "2026-02-23", // Mon
        endDate: "2026-03-06", // Fri, two weeks later
        scheduleSlots: [0, 2, 4].map((weekday) => ({
          weekday,
          start_time: "10:00:00",
          duration_minutes: 240,
        })),
      };
    case "event":
      return {
        startDate: "2026-01-30",
        endDate: "2026-01-30",
        scheduleSlots: [
          { weekday: 4, start_time: "18:00:00", duration_minutes: 120 },
        ],
      };
  }
}

// Static location fixtures. The detail-body and card both render
// "site, parent" for in-person and "muni" for online municipality_clubs;
// the IDs are placeholders that mock detail rows reference via
// location_id. None of these UUIDs ever hit the DB — the preview route
// renders straight from this fixture.
const MOCK_LOC_TAPIOLA: BrowseRowLocation = {
  id: "mock-loc-tapiolan-koulu",
  name: "Tapiolan koulu",
  name_i18n: null,
  type: "site",
  parent: {
    id: "mock-loc-espoo",
    name: "Espoo",
    name_i18n: { sv: "Esbo" },
    type: "municipality",
  },
};
// Municipality node (not a school site) — the location an online muni club
// references. `formatProductLocation` renders its city name as the "online —
// {city}" line when the product is remote.
const MOCK_LOC_ESPOO_MUNI: BrowseRowLocation = {
  id: "mock-loc-espoo-muni",
  name: "Espoo",
  name_i18n: { sv: "Esbo" },
  type: "municipality",
  parent: {
    id: "mock-loc-uusimaa",
    name: "Uusimaa",
    name_i18n: { sv: "Nyland" },
    type: "region",
  },
};
const MOCK_LOC_SOG_HQ: BrowseRowLocation = {
  id: "mock-loc-sog-hq",
  name: "Sogverse HQ",
  name_i18n: null,
  type: "site",
  parent: {
    id: "mock-loc-helsinki",
    name: "Helsinki",
    name_i18n: { sv: "Helsingfors" },
    type: "municipality",
  },
};

function pickLocationFixture(
  productType: ProductType,
): BrowseRowLocation | null {
  switch (productType) {
    case "consumer_club":
      // Online consumer club, no muni — no joined location.
      return null;
    case "municipality_club":
      return MOCK_LOC_TAPIOLA;
    case "camp":
    case "event":
      return MOCK_LOC_SOG_HQ;
  }
}

function pickHolidays(
  productType: ProductType,
): { date: string; reason: string }[] {
  if (productType !== "consumer_club" && productType !== "municipality_club") {
    return [];
  }
  return [
    { date: "2026-02-24", reason: "Talviloma · winter break" },
    { date: "2026-04-07", reason: "Pääsiäisloma · Easter" },
    { date: "2026-05-01", reason: "Vappu" },
  ];
}

// ---------- Price rows ----------

// The admin create form requires a row per supported currency (validated
// in product-build.ts), so the mock has to as well — otherwise the
// panel falls into the "Pricing isn't available in {currency}" branch
// when the viewer's currency picker is on GBP or USD.
//
// Static FX-ish rates are fine here: this is a visual reference fixture,
// not a checkout.
const FX_FROM_EUR = { eur: 1, gbp: 0.86, usd: 1.08 } as const;

function buildPriceRows(
  productId: string,
  priceCentsEur: number,
): ProductDetailRow["product_prices"] {
  const refTimestamp = new Date(STATIC_REF_MS - 30 * DAY_MS).toISOString();
  return SUPPORTED_CURRENCIES.map((currency) => ({
    product_id: productId,
    currency,
    price_cents: Math.round(priceCentsEur * FX_FROM_EUR[currency]),
    created_at: refTimestamp,
    updated_at: refTimestamp,
  }));
}

// ---------- Product status ----------

// `status` is the stored DB status. The panel renders from the authored
// `state`, not this, but matching the shape a real row would carry avoids
// confusing future readers: open/ended products stay 'running', full or
// pre-launch ones sit in 'pending'.
function pickStatus(
  state: RegistrationState,
): "pending" | "running" | "draft" | "cancelled" {
  switch (state.kind) {
    case "full_closed":
    case "full_waitlist":
    case "pending_thr":
    case "closed_pre":
      return "pending";
    case "open":
    case "running_late":
    case "ended":
      return "running";
  }
}
