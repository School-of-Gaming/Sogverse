import type {
  BillingMode,
  ProductType,
} from "@/types";

// Per-type configuration that drives which form sections and fields render.
// Rather than scattering `if (type === ...)` throughout the form, collect the
// branching shape here so each new type is a config change + a config entry.

export type ScheduleShape =
  | "weekly_ongoing"     // consumer_club: weekly, optional end_date
  | "weekly_bounded"     // municipality_club: weekly, required start/end
  | "multi_day_bounded"  // camp: multiple weekdays, start/end dates
  | "single_date";       // event: single date, single slot

// Three start triggers from doc §4.11. Types list only the ones that make
// sense — muni clubs are ticket-drop only ("date"), camps always have a
// bounded schedule so they can't be threshold-only ("threshold" disallowed).
export type StartMode = "date" | "date_and_threshold" | "threshold";

export type BillingOption =
  | { mode: "paid"; required: true }                                    // consumer_club, camp
  | { mode: "external_contract"; required: true }                       // municipality_club
  | { mode: "free_or_paid" };                                           // event

// Pricing shape — drives the Capacity & billing card. Each paid type collects
// a single `price_cents`: consumer clubs charge it as a flat monthly
// subscription, camps and events as a one-time total. Municipality clubs are
// invoiced off-site; the form shows an info card instead of a price input.
export type PricingShape = "monthly" | "upfront_total" | "external" | "none";

export interface ProductTypeConfig {
  productType: ProductType;
  /** i18n key under admin.products.types (label + plural) */
  i18nKey: "consumerClub" | "municipalityClub" | "camp" | "event";
  routeSlug: string; // "consumer-clubs"
  scheduleShape: ScheduleShape;
  billing: BillingOption;
  pricingShape: PricingShape;
  allowsRemote: boolean;
  allowsInPerson: boolean;
  requiresMunicipalityWhenOnline: boolean;
  /**
   * The one country this product type exists in, or null for anywhere. A
   * municipality club is funded by a Finnish kunta and by nothing else, so
   * BOTH of its location shapes are bound to Finland: the funding municipality
   * it anchors to online, and the venue it runs at in person. The location
   * pickers read this to open inside that country and offer no other
   * country's rows.
   */
  countryBound: string | null;
  hasHolidayCalendars: boolean;
  /** Start triggers admin can choose from. First entry is the default. */
  allowedStartModes: StartMode[];
  defaultBillingMode: BillingMode;
}

/**
 * The country municipality clubs exist in: they are funded by Finnish kuntaa.
 * One constant so the type's `countryBound` below and the online municipality
 * field's own hardcoded gate (in the product location picker) cannot drift
 * apart.
 */
export const MUNI_CLUB_COUNTRY_CODE = "FI";

export const PRODUCT_TYPE_CONFIG: Record<ProductType, ProductTypeConfig> = {
  consumer_club: {
    productType: "consumer_club",
    i18nKey: "consumerClub",
    routeSlug: "consumer-clubs",
    scheduleShape: "weekly_ongoing",
    billing: { mode: "paid", required: true },
    pricingShape: "monthly",
    allowsRemote: true,
    allowsInPerson: true,
    requiresMunicipalityWhenOnline: false,
    countryBound: null,
    hasHolidayCalendars: true,
    allowedStartModes: ["date", "date_and_threshold", "threshold"],
    defaultBillingMode: "paid",
  },
  municipality_club: {
    productType: "municipality_club",
    i18nKey: "municipalityClub",
    routeSlug: "municipality-clubs",
    scheduleShape: "weekly_bounded",
    billing: { mode: "external_contract", required: true },
    pricingShape: "external",
    allowsRemote: true,
    allowsInPerson: true,
    requiresMunicipalityWhenOnline: true,
    countryBound: MUNI_CLUB_COUNTRY_CODE,
    hasHolidayCalendars: true,
    allowedStartModes: ["date"],
    defaultBillingMode: "external_contract",
  },
  camp: {
    productType: "camp",
    i18nKey: "camp",
    routeSlug: "camps",
    scheduleShape: "multi_day_bounded",
    billing: { mode: "paid", required: true },
    pricingShape: "upfront_total",
    allowsRemote: true,
    allowsInPerson: true,
    requiresMunicipalityWhenOnline: false,
    countryBound: null,
    hasHolidayCalendars: false,
    allowedStartModes: ["date", "date_and_threshold"],
    defaultBillingMode: "paid",
  },
  event: {
    productType: "event",
    i18nKey: "event",
    routeSlug: "events",
    // Events default to free; switching to paid uses upfront_total. The
    // pricing card only renders when billing_mode === "paid".
    pricingShape: "upfront_total",
    scheduleShape: "single_date",
    billing: { mode: "free_or_paid" },
    allowsRemote: true,
    allowsInPerson: true,
    requiresMunicipalityWhenOnline: false,
    countryBound: null,
    hasHolidayCalendars: false,
    allowedStartModes: ["date", "date_and_threshold", "threshold"],
    defaultBillingMode: "free",
  },
};

// ===== The free/paid choice =====
//
// Lives here rather than with the form's other chooser tuples because it is
// the one chooser that feeds a *derivation* the non-form layers need too: the
// lock resolver reads it, and putting the resolver's dependency in the form
// state module would make the two import each other. This module has no
// dependencies of its own, so it can sit under both.

// Listed as a module-level constant so the lint rule against literal strings
// (i18n) doesn't fire for these structural keys — same reason as the chooser
// tuples in product-form-state.ts.
export const PAID_MODE_VALUES = ["paid", "free"] as const;

export type PaidMode = (typeof PAID_MODE_VALUES)[number];

/**
 * Which billing mode is actually in force, given the type's billing option and
 * (for the one type that offers a choice) the admin's free/paid pick. Every
 * type but `event` pins its mode, so `paidMode` is ignored for them.
 */
export function effectiveBillingMode(
  config: ProductTypeConfig,
  paidMode: PaidMode,
): BillingMode {
  if (config.billing.mode === "free_or_paid") {
    return paidMode === "free" ? "free" : "paid";
  }
  return config.billing.mode === "external_contract"
    ? "external_contract"
    : "paid";
}

export function productTypeFromSlug(slug: string): ProductType | null {
  const entry = Object.values(PRODUCT_TYPE_CONFIG).find(
    (c) => c.routeSlug === slug
  );
  return entry?.productType ?? null;
}
