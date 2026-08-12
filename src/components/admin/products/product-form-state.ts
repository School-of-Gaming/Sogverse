import { type SupportedCurrency } from "@/lib/constants";
import type { SupportedLocale } from "@/lib/constants/locales";
import type { ProductLongDescription, ProductTopic } from "@/types";
import { effectiveBillingMode } from "./product-type-config";
import type {
  PaidMode,
  ProductTypeConfig,
  StartMode,
} from "./product-type-config";
import type { ScheduleSlotDraft } from "./schedule-slots-editor";

// Module-level constants — listed here rather than inline so the lint rule
// against literal strings (i18n) doesn't fire for these structural keys.
// (The free/paid chooser's tuple is the one exception: it lives in
// product-type-config.ts alongside the derivation that reads it.)
export const REGISTRATION_OPENS_MODE_VALUES = [
  "immediately",
  "scheduled",
] as const;
// Seat-limit chooser values. "limited" pairs with a seat-count input;
// "unlimited" means no seat cap (seat_count = null). Maps to the `uncapped`
// boolean: unlimited ⇔ uncapped. Offered for every type but municipality clubs
// — see `offersUncapped`.
export const SEAT_LIMIT_MODE_VALUES = ["limited", "unlimited"] as const;
// End-date chooser values for consumer clubs (the only ongoing type). "ongoing"
// means no end date (end_date = null); "dated" pairs with a date input. Maps to
// the `hasEndDate` boolean: dated ⇔ hasEndDate. A mutually-exclusive radio
// instead of a "leave blank for ongoing" date input — Safari's native date
// field won't accept an empty value, so "blank means ongoing" wasn't reachable.
export const END_DATE_MODE_VALUES = ["ongoing", "dated"] as const;

// Per-session fee selectors. Each fee is one EUR amount the DB stores as
// integer cents, with state DERIVED from the value (null = unknown/none,
// 0 = volunteer, > 0 = fee). The form makes the human pick that state
// explicitly — a select, never an empty box or a typed 0 — so these are the
// allowed select values per fee. The amount input only shows for "fee".
//   primary gedu:  unknown | volunteer | fee   (default unknown; always shown)
//   assistant:     none    | volunteer | fee   (default none; always shown)
//   municipality:  unknown | fee               (default unknown; muni clubs only)
export const PRIMARY_GEDU_FEE_STATUS_VALUES = [
  "unknown",
  "volunteer",
  "fee",
] as const;
export const ASSISTANT_GEDU_FEE_STATUS_VALUES = [
  "none",
  "volunteer",
  "fee",
] as const;
export const MUNICIPALITY_FEE_STATUS_VALUES = ["unknown", "fee"] as const;

export type PrimaryGeduFeeStatus =
  (typeof PRIMARY_GEDU_FEE_STATUS_VALUES)[number];
export type AssistantGeduFeeStatus =
  (typeof ASSISTANT_GEDU_FEE_STATUS_VALUES)[number];
export type MunicipalityFeeStatus =
  (typeof MUNICIPALITY_FEE_STATUS_VALUES)[number];

// A fee's form state: the chosen status plus the decimal-string amount, which
// is only meaningful (and only collected) when status is "fee".
export type FeeDraft<S> = { status: S; amount: string };

// 15-minute-interval time picker — same pattern as schedule-slots-editor.tsx,
// where the rationale comment lives (Chrome's <input type="time"> ignores `step`).
export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0"),
);
export const MINUTE_OPTIONS = ["00", "15", "30", "45"] as const;

export const FIXED_TIMEZONE = "Europe/Helsinki";

export type RegistrationOpensMode =
  (typeof REGISTRATION_OPENS_MODE_VALUES)[number];
export type SeatLimitMode = (typeof SEAT_LIMIT_MODE_VALUES)[number];

// Per-locale draft. `shortDescription` is the required teaser (the old single
// `description`); `longDescription` is the optional structured blurb edited as
// an ordered list of heading/paragraph blocks. An empty `longDescription`
// array means "no long description" and submits as SQL NULL.
export type TranslationDraft = {
  name: string;
  shortDescription: string;
  longDescription: ProductLongDescription;
};

export interface FormState {
  // Per-locale name + descriptions. Admin starts with one tab (their UI locale)
  // and can add more. Submission writes one product_translations row per
  // locale present in this map. At least one filled locale is required (any).
  translations: Partial<Record<SupportedLocale, TranslationDraft>>;
  activeLocale: SupportedLocale;

  // Identity (non-translated). `topic` is the fixed product_topic enum; ""
  // is the unselected state the create form starts in.
  topic: ProductTopic | "";
  // Lesson material for whoever teaches this product. Staff-facing: it is
  // rendered in the gedu group workspace and on no family surface at all.
  materialUrl: string;
  // File   — newly picked replacement (admin uploaded a fresh image).
  // string — existing image_path on the product (edit-mode load).
  // null   — no image, or admin cleared the existing one.
  image: File | string | null;

  // Audience
  //
  // Who may occupy a seat, edited as the Audience section's checkbox pair. Both
  // flags are loaded and sent back on every save because the update RPC assigns
  // every editable column on every call: a product's audience has to survive an
  // edit that was about something else, and the only way it can is by riding in
  // state. Hardcoding the defaults in the payload builder instead would reset
  // every product an admin so much as renamed.
  forGamers: boolean;
  forParents: boolean;
  // The gamer audience's age range, as typed. Blank means "no range" and reaches
  // the database as NULL — which is legal exactly when `forGamers` is false, so
  // the payload builder derives the pair from the flag rather than copying it.
  // Unticking For gamers hides the fields without emptying them, so a mis-click
  // costs nothing for as long as the form stays open.
  minAge: string;
  maxAge: string;
  spokenLanguageCode: string;

  // Where
  isRemote: boolean;
  locationId: string | null;

  // When
  startMode: StartMode;
  startDate: string;
  // Whether a consumer club has a fixed end date. `false` ⇒ ongoing (end_date
  // null), `endDate` is ignored. Only the consumer-club form surfaces this
  // choice; other types always require an end date, so the flag is unused for
  // them. See END_DATE_MODE_VALUES.
  hasEndDate: boolean;
  endDate: string;
  scheduleSlots: ScheduleSlotDraft[];
  holidayCalendarIds: Set<string>;
  signupThreshold: string;

  // Capacity & billing
  paidMode: PaidMode;
  // Per-currency price map. The platform is EUR-only (see
  // src/lib/constants/currency.ts), so this currently holds a single `eur`
  // row — the shape is kept currency-keyed so re-enabling currencies is a
  // matter of widening SUPPORTED_CURRENCIES, not reshaping form state.
  prices: Record<SupportedCurrency, { session: string; month: string }>;
  seatCount: string;
  uncapped: boolean;
  waitlistEnabled: boolean;

  // Per-session operating fees. `municipalityFee` is only surfaced for
  // municipality clubs; for other types it's kept at its default and forced
  // to null at build time (the DB CHECK rejects a muni fee on a non-muni
  // product).
  primaryGeduFee: FeeDraft<PrimaryGeduFeeStatus>;
  assistantGeduFee: FeeDraft<AssistantGeduFeeStatus>;
  municipalityFee: FeeDraft<MunicipalityFeeStatus>;

  // Registration timing — `immediately` accepts signups as soon as the
  // product is published; `scheduled` opens at the picked Helsinki-local
  // date+time. The date/hour/minute fields are kept around even when mode
  // is `immediately` so toggling back doesn't lose what was typed.
  registrationOpensMode: RegistrationOpensMode;
  registrationOpensDate: string;
  registrationOpensHour: string;
  registrationOpensMinute: string;

  // Visibility
  isVisible: boolean;
}

function defaultSlots(config: ProductTypeConfig): ScheduleSlotDraft[] {
  if (config.scheduleShape === "multi_day_bounded") {
    return [
      { weekday: 0, start_time: "10:00", duration_minutes: 180 },
      { weekday: 2, start_time: "10:00", duration_minutes: 180 },
      { weekday: 4, start_time: "10:00", duration_minutes: 180 },
    ];
  }
  if (config.scheduleShape === "single_date") {
    return [{ weekday: 0, start_time: "18:00", duration_minutes: 90 }];
  }
  return [{ weekday: 1, start_time: "16:00", duration_minutes: 90 }];
}

export function initialState(
  config: ProductTypeConfig,
  uiLocale: SupportedLocale,
): FormState {
  // The type's own default billing mode, folded into the form's free/paid
  // chooser. Events start free; clubs and camps start paid; municipality clubs
  // have no choice to make and the pick is ignored for them.
  const initialPaidMode = defaultPaidMode(config);
  const startsCapped = capacityDefaultsToCapped(config, initialPaidMode);
  return {
    translations: {
      [uiLocale]: { name: "", shortDescription: "", longDescription: [] },
    },
    activeLocale: uiLocale,
    topic: "",
    materialUrl: "",
    image: null,
    // A new product is for children until somebody says otherwise — the shape
    // every product has today, and the only one the form can currently express.
    forGamers: true,
    forParents: false,
    minAge: "7",
    maxAge: "12",
    spokenLanguageCode: "",
    isRemote: true,
    locationId: null,
    startMode: config.allowedStartModes[0],
    // Blank on every type, consumer clubs included: a club may now start on a
    // future date (billing defers to it), so there is no safe date to pin and
    // `startDateRequired` makes the admin choose one.
    startDate: "",
    hasEndDate: false,
    endDate: "",
    scheduleSlots: defaultSlots(config),
    holidayCalendarIds: new Set(),
    signupThreshold: "",
    paidMode: initialPaidMode,
    prices: {
      eur: { session: "", month: "" },
    },
    // Always blank — there's no sensible default capacity. An admin who opts
    // into a seat cap must type the real number; nothing to skip past.
    seatCount: "",
    // Fees start in their "not yet known" state so the admin product list
    // alerts until they're filled (primary gedu + muni). Assistant defaults to
    // "none" — an assistant educator is the exception, not the norm.
    primaryGeduFee: { status: "unknown", amount: "" },
    assistantGeduFee: { status: "none", amount: "" },
    municipalityFee: { status: "unknown", amount: "" },
    // Capacity defaults — see `capacityDefaultsToCapped` for who caps and why.
    uncapped: !startsCapped,
    // The waitlist only exists behind a cap, so it follows the same answer.
    waitlistEnabled: startsCapped,
    registrationOpensMode: "immediately",
    registrationOpensDate: "",
    registrationOpensHour: "10",
    registrationOpensMinute: "00",
    isVisible: false,
  };
}

// ===== Derivations =====
//
// Multi-line and/or used by both the parent (validate/submit) and individual
// section components. Single-line booleans like `usesDate` are derived inline
// where they're consumed.

export function effectivePricingShape(
  config: ProductTypeConfig,
): "monthly" | "upfront_total" {
  return config.pricingShape === "monthly" ? "monthly" : "upfront_total";
}

// ===== Capacity =====
//
// Three rules, all keyed to the money rather than the product type, because
// what a cap *means* is keyed to the money: on a no-charge signup the RPC
// validates the cap and writes the seat in one locked transaction, so the cap
// is hard; on a paid one the seat arrives with the payment, so the cap is soft
// and deliberately opt-in.

/** The free/paid pick a brand-new product of this type starts on. */
export function defaultPaidMode(config: ProductTypeConfig): PaidMode {
  return config.defaultBillingMode === "free" ? "free" : "paid";
}

/**
 * Whether "no seat limit" is on offer at all. Municipality clubs are contracted
 * for a specific number of places, so they are the one type where it is not:
 * their form drops the chooser and asks for the number outright.
 *
 * `initialState` and `existingFormState` both pin `uncapped` to false for them,
 * so the rest of the form (which reads the flag, not the type) needs no second
 * special case — and a stored uncapped muni row heals on its next save, with
 * validation demanding the number before the payload is built.
 */
export function offersUncapped(config: ProductTypeConfig): boolean {
  return config.productType !== "municipality_club";
}

/**
 * Whether a fresh product starts capped. Municipality clubs must be (above),
 * and **no-charge products default to it** so "forgot to cap" cannot happen:
 * the admin either types a number or actively picks "no seat limit". Paid
 * products default uncapped — a soft cap is a deliberate choice, not something
 * to opt out of.
 */
export function capacityDefaultsToCapped(
  config: ProductTypeConfig,
  paidMode: PaidMode,
): boolean {
  if (!offersUncapped(config)) return true;
  return effectiveBillingMode(config, paidMode) === "free";
}

/**
 * Apply a free/paid change to the whole form state, capacity included.
 *
 * Flipping **to free** turns the cap on if the form is currently uncapped —
 * same "cannot forget" rule the initial state applies, arriving at the same
 * place by a different route — and takes the waitlist to its free default of
 * on. Flipping **to paid** leaves capacity entirely alone: caps and waitlists
 * are legal on both sides, so there is nothing to clear.
 *
 * Neither direction touches a seat count the admin already typed. That matters
 * most on the edit form, where flipping a capped paid product to free must keep
 * its stored cap rather than blanking it and demanding the number again.
 */
export function withPaidMode(state: FormState, paidMode: PaidMode): FormState {
  if (paidMode !== "free" || !state.uncapped) return { ...state, paidMode };
  return { ...state, paidMode, uncapped: false, waitlistEnabled: true };
}

export function startModeUsesDate(mode: StartMode): boolean {
  return mode === "date" || mode === "date_and_threshold";
}

export function startModeUsesThreshold(mode: StartMode): boolean {
  return mode === "threshold" || mode === "date_and_threshold";
}

export function locationPickerMode(
  config: ProductTypeConfig,
  isRemote: boolean,
): "site" | "municipality" | null {
  // Online products only need a location picker for municipality clubs
  // (they anchor to the funding municipality). In-person products always
  // pick a site.
  if (isRemote) {
    return config.requiresMunicipalityWhenOnline ? "municipality" : null;
  }
  return "site";
}
