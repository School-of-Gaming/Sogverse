import type {
  BillingModeV2,
  ProductTypeV2,
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

// Pricing shape — drives the Capacity & billing card. Only consumer clubs
// run on a recurring per-session model with a subscription option, so they
// need both `price_per_session` AND `price_per_month`. Camps and events are
// upfront-only, so they collect a single total. Municipality clubs are
// invoiced off-site; the form shows an info card instead of a price input.
export type PricingShape = "session_and_month" | "upfront_total" | "external" | "none";

export interface ProductTypeConfig {
  productType: ProductTypeV2;
  /** i18n key under admin.productsV2.types (label + plural + tagline + blurb + traits) */
  i18nKey: "consumerClub" | "municipalityClub" | "camp" | "event";
  routeSlug: string; // "consumer-clubs"
  scheduleShape: ScheduleShape;
  billing: BillingOption;
  pricingShape: PricingShape;
  allowsRemote: boolean;
  allowsInPerson: boolean;
  requiresMunicipalityWhenOnline: boolean;
  hasHolidayCalendars: boolean;
  hasRefundWindow: boolean;
  /** Start triggers admin can choose from. First entry is the default. */
  allowedStartModes: StartMode[];
  defaultBillingMode: BillingModeV2;
}

export const PRODUCT_TYPE_CONFIG: Record<ProductTypeV2, ProductTypeConfig> = {
  consumer_club: {
    productType: "consumer_club",
    i18nKey: "consumerClub",
    routeSlug: "consumer-clubs",
    scheduleShape: "weekly_ongoing",
    billing: { mode: "paid", required: true },
    pricingShape: "session_and_month",
    allowsRemote: true,
    allowsInPerson: true,
    requiresMunicipalityWhenOnline: false,
    hasHolidayCalendars: true,
    hasRefundWindow: false,
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
    hasHolidayCalendars: true,
    hasRefundWindow: false,
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
    hasHolidayCalendars: false,
    hasRefundWindow: true,
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
    hasHolidayCalendars: false,
    hasRefundWindow: true,
    allowedStartModes: ["date", "date_and_threshold", "threshold"],
    defaultBillingMode: "free",
  },
};

export function productTypeFromSlug(slug: string): ProductTypeV2 | null {
  const entry = Object.values(PRODUCT_TYPE_CONFIG).find(
    (c) => c.routeSlug === slug
  );
  return entry?.productType ?? null;
}
