import type { ProductTypeV2 } from "@/types";
import { SUPPORTED_CURRENCIES } from "@/lib/constants/currency";
import type { ProductV2DetailRow } from "@/services/products-v2";
import type { RegistrationState } from "./derive-registration-state";
import type { AuthState } from "./signup-panel-view";

// Synthetic detail-page fixtures, one per (productType, stateKind) pair.
// Used by the `/preview/products-v2/[type]/[state]` route + the
// /admin/ui-components page. Real visitors never land on these.
//
// `closed_pre` anchors its `opensAt` on `Date.now()` at build time so the
// countdown shows a live, ticking 2-day-ish window regardless of when an
// admin loads the page. The other dates (start_date, end_date, holidays)
// are static reference fixtures — fine for visual review even when the
// calendar drifts past today.
//
// Pick the type / state in the URL; the fixture is built on demand. The
// returned object is shape-compatible with what the live data fetch
// produces, so the body component renders identically.

export type PreviewStateKind =
  | "closed_pre"
  | "open"
  | "open_almost_full"
  | "pending_thr"
  | "full_waitlist"
  | "full_closed"
  | "running_late"
  | "ended";

export const PREVIEW_STATES: PreviewStateKind[] = [
  "closed_pre",
  "open",
  "open_almost_full",
  "pending_thr",
  "full_waitlist",
  "full_closed",
  "running_late",
  "ended",
];

export const PREVIEW_TYPES: ProductTypeV2[] = [
  "consumer_club",
  "municipality_club",
  "camp",
  "event",
];

// Static reference instant for non-ticking dates (start_date, end_date,
// timestamps on the row). The countdown's `opensAt` is *not* anchored
// here — see `pickRegistrationOpensAt` for live-time handling.
const STATIC_REF_MS = Date.UTC(2026, 0, 5, 12, 0, 0); // Mon 5 Jan 2026, 12:00 UTC

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

interface BuildFixtureResult {
  product: ProductV2DetailRow;
  state: RegistrationState;
  authState: AuthState;
}

export function buildDetailFixture(
  productType: ProductTypeV2,
  stateKind: PreviewStateKind,
): BuildFixtureResult {
  // Capture once so the product row and the registration state agree on
  // the same "opens at" instant — otherwise the panel countdown could
  // tick against one timestamp while the row reports another.
  const nowMs = Date.now();
  const product = buildBaseProduct(productType, stateKind, nowMs);
  const state = buildRegistrationState(productType, stateKind, nowMs);
  const authState: AuthState = {
    kind: "ready",
    gamers: [
      { id: "mock-g-1", name: "Oona", age: 10 },
      { id: "mock-g-2", name: "Aino", age: 8 },
    ],
    selectedGamerId: "mock-g-1",
  };
  return { product, state, authState };
}

// ---------- Base product shape ----------

function buildBaseProduct(
  productType: ProductTypeV2,
  stateKind: PreviewStateKind,
  nowMs: number,
): ProductV2DetailRow {
  const billingMode = pickBillingMode(productType);
  const seatCount = stateKind === "pending_thr" ? null : 12;

  // Use copy that fits each type so the demo reads as realistic.
  const copy = COPY[productType];

  // Threshold + dates only matter for clubs (term-bound). Camps and events
  // are date-bound; pick small ranges that produce a readable calendar.
  const { startDate, endDate, scheduleSlots } = pickSchedule(productType);

  const registrationOpensAt = pickRegistrationOpensAt(stateKind, nowMs);
  const status = pickStatus(productType, stateKind);

  // Cast through unknown — the mock only fills the fields the detail
  // body reads, and we don't care about the `created_at` / `updated_at`
  // metadata the database would otherwise populate.
  return {
    id: `mock-${productType}-${stateKind}`,
    product_type: productType,
    billing_mode: billingMode,
    status,
    is_visible: true,
    is_remote: copy.isRemote,
    min_age: 8,
    max_age: 12,
    spoken_language_code: "fi",
    location_id: null,
    padlet_url: null,
    signup_threshold: stateKind === "pending_thr" ? 8 : null,
    start_date: startDate,
    end_date: endDate,
    timezone: "Europe/Helsinki",
    seat_count: seatCount,
    waitlist_enabled: stateKind === "full_waitlist",
    registration_opens_at: registrationOpensAt,
    image_path: null,
    topic_id: "mock-topic-1",
    created_at: new Date(STATIC_REF_MS - 30 * DAY_MS).toISOString(),
    updated_at: new Date(STATIC_REF_MS - 30 * DAY_MS).toISOString(),
    topics_v2: {
      slug: "minecraft",
      kind: "game",
      icon_path: null,
      topic_translations_v2: [
        { locale: "en", name: "Minecraft", topic_id: "mock-topic-1" } as never,
      ],
    },
    product_translations_v2: [
      {
        locale: "en",
        name: copy.name,
        description: copy.description,
        product_id: `mock-${productType}-${stateKind}`,
      } as never,
    ],
    product_tags_v2: [
      {
        tags_v2: {
          slug: "creative",
          tag_translations_v2: [
            { locale: "en", name: "Creative", tag_id: "mock-tag-1" } as never,
          ],
        },
      },
      {
        tags_v2: {
          slug: "beginner",
          tag_translations_v2: [
            {
              locale: "en",
              name: "Beginner friendly",
              tag_id: "mock-tag-2",
            } as never,
          ],
        },
      },
    ],
    product_prices_v2:
      billingMode === "free" || billingMode === "external_contract"
        ? []
        : buildPriceRows(productType, stateKind),
    schedule_slots_v2: scheduleSlots,
    holidays: pickHolidays(productType),
  } as unknown as ProductV2DetailRow;
}

// ---------- Per-type narrative copy ----------

interface TypeCopy {
  name: string;
  description: string;
  isRemote: boolean;
}

const COPY: Record<ProductTypeV2, TypeCopy> = {
  consumer_club: {
    name: "Minecraft Redstone Club",
    description:
      "We build little machines together — doors that open on command, sorters, traps, small factories. A playful way to learn how circuits actually think.",
    isRemote: true,
  },
  municipality_club: {
    name: "Espoon Minecraft-kerho",
    description:
      "Funded by the City of Espoo. Free for Espoo residents. Held weekly at Tapiolan koulu after school.",
    isRemote: false,
  },
  camp: {
    name: "Spring Break Roblox Camp",
    description:
      "Five days of game design. Each day we play a different style and end the week with a kid-built obby everyone can try.",
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

function pickSchedule(productType: ProductTypeV2): {
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
      return {
        startDate: "2026-02-23",
        endDate: "2026-02-27",
        // Mon–Fri.
        scheduleSlots: [0, 1, 2, 3, 4].map((weekday) => ({
          weekday,
          start_time: "10:00:00",
          duration_minutes: 360,
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

function pickHolidays(
  productType: ProductTypeV2,
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

function pickBillingMode(
  productType: ProductTypeV2,
): "paid" | "free" | "external_contract" {
  switch (productType) {
    case "municipality_club":
      return "external_contract";
    case "event":
      return "paid";
    default:
      return "paid";
  }
}

// ---------- Price rows ----------

// The admin create form requires a row per supported currency (validated
// in product-v2-build.ts), so the mock has to as well — otherwise the
// panel falls into the "Pricing isn't available in {currency}" branch
// when the viewer's currency picker is on GBP or USD.
//
// Static FX-ish rates are fine here: this is a visual reference fixture,
// not a checkout.
const FX_FROM_EUR = { eur: 1, gbp: 0.86, usd: 1.08 } as const;

function buildPriceRows(
  productType: ProductTypeV2,
  stateKind: PreviewStateKind,
): unknown[] {
  const eurSession = productType === "consumer_club" ? 1000 : 9000;
  const eurMonth = 3600;
  return SUPPORTED_CURRENCIES.map((currency) => ({
    product_id: `mock-${productType}-${stateKind}`,
    currency,
    price_per_session: Math.round(eurSession * FX_FROM_EUR[currency]),
    price_per_month: Math.round(eurMonth * FX_FROM_EUR[currency]),
  }));
}

// ---------- Registration drop instant ----------

function pickRegistrationOpensAt(
  stateKind: PreviewStateKind,
  nowMs: number,
): string {
  switch (stateKind) {
    case "closed_pre":
      // 2 days, 4 hrs ahead of *now* — gives the countdown enough digits
      // and ensures it actually ticks for an admin reviewing the mock.
      return new Date(nowMs + 2 * DAY_MS + 4 * HOUR_MS).toISOString();
    default:
      // Already open in every other state.
      return new Date(nowMs - DAY_MS).toISOString();
  }
}

function pickStatus(
  productType: ProductTypeV2,
  stateKind: PreviewStateKind,
): "pending" | "running" | "draft" | "cancelled" {
  void productType;
  switch (stateKind) {
    case "ended":
      return "cancelled"; // RLS-friendly proxy for "ended" in the mock
    case "running_late":
    case "open":
    case "open_almost_full":
      return "running";
    case "pending_thr":
    case "closed_pre":
    case "full_closed":
    case "full_waitlist":
      return "pending";
  }
}

// ---------- Registration state passed to the panel ----------

function buildRegistrationState(
  productType: ProductTypeV2,
  stateKind: PreviewStateKind,
  nowMs: number,
): RegistrationState {
  void productType;
  switch (stateKind) {
    case "closed_pre":
      return {
        kind: "closed_pre",
        opensAt: new Date(nowMs + 2 * DAY_MS + 4 * HOUR_MS).toISOString(),
      };
    case "open":
      return {
        kind: "open",
        seatCount: 12,
        seatsLeft: 8,
        waitlistEnabled: false,
      };
    case "open_almost_full":
      return {
        kind: "open",
        seatCount: 12,
        seatsLeft: 2,
        waitlistEnabled: false,
      };
    case "pending_thr":
      return { kind: "pending_thr", threshold: 8, count: 5 };
    case "full_waitlist":
      return { kind: "full_waitlist", seatCount: 12 };
    case "full_closed":
      return { kind: "full_closed", seatCount: 12 };
    case "running_late":
      return { kind: "running_late" };
    case "ended":
      return { kind: "ended" };
  }
}
