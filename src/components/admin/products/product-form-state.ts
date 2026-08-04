import { formatInTimeZone } from "date-fns-tz";
import { type SupportedCurrency } from "@/lib/constants";
import type { SupportedLocale } from "@/lib/constants/locales";
import type { ProductLongDescription, ProductTopic } from "@/types";
import { formLocksFor } from "./form-locks";
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
// "unlimited" means no seat cap (seat_count = null) and is available for every
// product type. Maps to the `uncapped` boolean: unlimited ⇔ uncapped.
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
  padletUrl: string;
  // Lesson material for whoever teaches this product. Staff-facing: it is
  // rendered in the gedu group workspace and on no family surface at all, which
  // is what makes it a different field from padletUrl rather than a second name
  // for it.
  materialUrl: string;
  // File   — newly picked replacement (admin uploaded a fresh image).
  // string — existing image_path on the product (edit-mode load).
  // null   — no image, or admin cleared the existing one.
  image: File | string | null;

  // Audience
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
  // Events default to free; everything else has a real billing mode already.
  const initialPaidMode: PaidMode =
    config.billing.mode === "free_or_paid" ? "free" : "paid";
  // The locks in effect for a brand-new product of this type, resolved through
  // the same function the sections use — never FORM_LOCKS directly, so there is
  // one place deciding.
  const locks = formLocksFor(config);
  // Consumer clubs launch starting today while the start-date control is
  // locked. Helsinki-local "today" — the form is fixed to FIXED_TIMEZONE —
  // never UTC (see CLAUDE.md "Date & Time Formatting").
  const lockedConsumerStartDate =
    locks.consumerClubStartDateToday && config.productType === "consumer_club"
      ? formatInTimeZone(new Date(), FIXED_TIMEZONE, "yyyy-MM-dd")
      : "";
  // Whether a fresh product of this type starts *capped*. Only one type does: a
  // municipality club is contracted for a specific number of places, so it
  // starts capped + waitlisted and the blank seatCount below forces the admin to
  // type the contracted figure. Every other type starts open — the rest have the
  // seat controls locked off entirely.
  //
  // The `!locks.seatCount` conjunct is redundant today — muni is the one type
  // that unlocks the cap, so it is always true here — and is kept as a tripwire
  // rather than simplified away. A capped default behind a *locked* seat control
  // is a broken form, not merely a wrong default: it renders a fresh product as
  // capped with a blank, disabled seat count, which validate() then refuses with
  // no way for the admin to fix it. If muni is ever re-locked, this pins it back
  // to uncapped instead.
  const startsCapped =
    !locks.seatCount && config.productType === "municipality_club";
  return {
    translations: {
      [uiLocale]: { name: "", shortDescription: "", longDescription: [] },
    },
    activeLocale: uiLocale,
    topic: "",
    padletUrl: "",
    materialUrl: "",
    image: null,
    minAge: "7",
    maxAge: "12",
    spokenLanguageCode: "",
    isRemote: true,
    locationId: null,
    startMode: config.allowedStartModes[0],
    startDate: lockedConsumerStartDate,
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
    // Capacity defaults — see `startsCapped` above for which types cap.
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

/**
 * Switch the seat-limit radio, dropping the waitlist when the cap goes away.
 *
 * **A control that stops rendering has not stopped submitting.** The waitlist
 * checkbox only shows behind a cap, but the build writes `waitlist_enabled`
 * unconditionally — so "cap it, tick the waitlist, change your mind, save"
 * stored a waitlisted product with no cap for a queue to ever form behind. The
 * same click that hides the checkbox therefore clears it; hiding is not
 * clearing, and the invisible half of the pair is the one nobody can catch by
 * looking.
 *
 * The seat count is deliberately *kept*. It sits in the same hidden block, but
 * it is inert while uncapped (the build reads `null` and validate skips it), and
 * an admin toggling back to Limited sees the number they typed still there —
 * which is the point of a radio pair rather than a destructive switch. The
 * waitlist flag has no such defence: nothing downstream ignores it.
 *
 * The reflow this causes is user-initiated, so the layout rule permits it.
 */
export function withSeatLimitMode(
  state: FormState,
  mode: SeatLimitMode,
): FormState {
  const uncapped = mode === "unlimited";
  return {
    ...state,
    uncapped,
    waitlistEnabled: uncapped ? false : state.waitlistEnabled,
  };
}

export function effectivePricingShape(
  config: ProductTypeConfig,
): "monthly" | "upfront_total" {
  return config.pricingShape === "monthly" ? "monthly" : "upfront_total";
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
