import { DEFAULT_CURRENCY, type SupportedCurrency } from "@/lib/constants";
import type { SupportedLocale } from "@/lib/constants/locales";
import type { ProductTopic, ProductType } from "@/types";
import type {
  ProductTypeConfig,
  StartMode,
} from "./product-type-config";
import type { ScheduleSlotDraft } from "./schedule-slots-editor";

// Module-level constants — listed here rather than inline so the lint rule
// against literal strings (i18n) doesn't fire for these structural keys.
export const PAID_MODE_VALUES = ["paid", "free"] as const;
export const REGISTRATION_OPENS_MODE_VALUES = [
  "immediately",
  "scheduled",
] as const;

// 15-minute-interval time picker — same pattern as schedule-slots-editor.tsx,
// where the rationale comment lives (Chrome's <input type="time"> ignores `step`).
export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0"),
);
export const MINUTE_OPTIONS = ["00", "15", "30", "45"] as const;

export const FIXED_TIMEZONE = "Europe/Helsinki";

export type PaidMode = (typeof PAID_MODE_VALUES)[number];
export type RegistrationOpensMode =
  (typeof REGISTRATION_OPENS_MODE_VALUES)[number];

export type TranslationDraft = { name: string; description: string };

export interface FormState {
  // Per-locale name + description. Admin starts with one tab (their UI locale)
  // and can add more. Submission writes one product_translations row per
  // locale present in this map. At least one filled locale is required (any).
  translations: Partial<Record<SupportedLocale, TranslationDraft>>;
  activeLocale: SupportedLocale;

  // Identity (non-translated). `topic` is the fixed product_topic enum; ""
  // is the unselected state the create form starts in.
  topic: ProductTopic | "";
  padletUrl: string;
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
  endDate: string;
  scheduleSlots: ScheduleSlotDraft[];
  holidayCalendarIds: Set<string>;
  signupThreshold: string;

  // Capacity & billing
  paidMode: PaidMode;
  prices: Record<SupportedCurrency, { session: string; month: string }>;
  // Currencies the admin has manually typed into. When EUR changes, every
  // non-EUR currency NOT in this set is re-filled from the EUR value via
  // FX. Adding to this set is a one-way "lock" — auto-fill won't overwrite
  // a value the admin has edited.
  manualEdits: Set<SupportedCurrency>;
  activeCurrency: SupportedCurrency;
  seatCount: string;
  uncapped: boolean;
  waitlistEnabled: boolean;

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

function defaultSeats(productType: ProductType): string {
  switch (productType) {
    case "consumer_club":
      return "10";
    case "municipality_club":
      return "12";
    case "camp":
      return "16";
    case "event":
      return "30";
  }
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
  return {
    translations: { [uiLocale]: { name: "", description: "" } },
    activeLocale: uiLocale,
    topic: "",
    padletUrl: "",
    image: null,
    minAge: "7",
    maxAge: "12",
    spokenLanguageCode: "",
    isRemote: true,
    locationId: null,
    startMode: config.allowedStartModes[0],
    startDate: "",
    endDate: "",
    scheduleSlots: defaultSlots(config),
    holidayCalendarIds: new Set(),
    signupThreshold: "",
    paidMode: initialPaidMode,
    prices: {
      eur: { session: "", month: "" },
      gbp: { session: "", month: "" },
      usd: { session: "", month: "" },
    },
    manualEdits: new Set(),
    activeCurrency: DEFAULT_CURRENCY,
    seatCount: defaultSeats(config.productType),
    uncapped: false,
    waitlistEnabled: true,
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

export function effectiveBillingMode(
  config: ProductTypeConfig,
  paidMode: PaidMode,
): "paid" | "free" | "external_contract" {
  if (config.billing.mode === "free_or_paid") {
    return paidMode === "free" ? "free" : "paid";
  }
  return config.billing.mode === "external_contract"
    ? "external_contract"
    : "paid";
}

export function effectivePricingShape(
  config: ProductTypeConfig,
): "session_and_month" | "upfront_total" {
  return config.pricingShape === "session_and_month"
    ? "session_and_month"
    : "upfront_total";
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
): "site" | "jurisdiction" | null {
  // Online products only need a location picker for municipality clubs
  // (they need a jurisdiction anchor). In-person products always pick a site.
  if (isRemote) {
    return config.requiresMunicipalityWhenOnline ? "jurisdiction" : null;
  }
  return "site";
}
