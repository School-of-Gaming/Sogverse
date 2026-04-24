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

export type BillingOption =
  | { mode: "paid"; required: true }                                    // consumer_club, camp
  | { mode: "external_contract"; required: true }                       // municipality_club
  | { mode: "free_or_paid" };                                           // event

export interface ProductTypeConfig {
  productType: ProductTypeV2;
  /** i18n key under admin.productsV2.types (label + plural) */
  i18nKey: "consumerClub" | "municipalityClub" | "camp" | "event";
  routeSlug: string; // "consumer-clubs"
  scheduleShape: ScheduleShape;
  billing: BillingOption;
  allowsRemote: boolean;
  allowsInPerson: boolean;
  requiresMunicipalityWhenOnline: boolean;
  hasHolidayCalendars: boolean;
  hasRefundWindow: boolean;
  hasSignupThreshold: boolean;
  defaultBillingMode: BillingModeV2;
}

export const PRODUCT_TYPE_CONFIG: Record<ProductTypeV2, ProductTypeConfig> = {
  consumer_club: {
    productType: "consumer_club",
    i18nKey: "consumerClub",
    routeSlug: "consumer-clubs",
    scheduleShape: "weekly_ongoing",
    billing: { mode: "paid", required: true },
    allowsRemote: true,
    allowsInPerson: true,
    requiresMunicipalityWhenOnline: false,
    hasHolidayCalendars: true,
    hasRefundWindow: false,
    hasSignupThreshold: true,
    defaultBillingMode: "paid",
  },
  municipality_club: {
    productType: "municipality_club",
    i18nKey: "municipalityClub",
    routeSlug: "municipality-clubs",
    scheduleShape: "weekly_bounded",
    billing: { mode: "external_contract", required: true },
    allowsRemote: true,
    allowsInPerson: true,
    requiresMunicipalityWhenOnline: true,
    hasHolidayCalendars: true,
    hasRefundWindow: false,
    hasSignupThreshold: false,
    defaultBillingMode: "external_contract",
  },
  camp: {
    productType: "camp",
    i18nKey: "camp",
    routeSlug: "camps",
    scheduleShape: "multi_day_bounded",
    billing: { mode: "paid", required: true },
    allowsRemote: true,
    allowsInPerson: true,
    requiresMunicipalityWhenOnline: false,
    hasHolidayCalendars: false,
    hasRefundWindow: true,
    hasSignupThreshold: true,
    defaultBillingMode: "paid",
  },
  event: {
    productType: "event",
    i18nKey: "event",
    routeSlug: "events",
    scheduleShape: "single_date",
    billing: { mode: "free_or_paid" },
    allowsRemote: true,
    allowsInPerson: true,
    requiresMunicipalityWhenOnline: false,
    hasHolidayCalendars: false,
    hasRefundWindow: true,
    hasSignupThreshold: false,
    defaultBillingMode: "free",
  },
};

export function productTypeFromSlug(slug: string): ProductTypeV2 | null {
  const entry = Object.values(PRODUCT_TYPE_CONFIG).find(
    (c) => c.routeSlug === slug
  );
  return entry?.productType ?? null;
}
