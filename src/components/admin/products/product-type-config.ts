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
  | { mode: "external_contract"; required: true }                       // municipality_club
  | { mode: "free_or_paid" };                                           // consumer_club, camp, event

// Pricing shape — drives the Capacity & billing card. A paid product collects
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
  /**
   * Whether the form offers a **region lock** — one country whose families may
   * enrol, chosen from the seeded entries of `SUPPORTED_COUNTRIES`. Off for
   * municipality clubs and on for everything else.
   *
   * Two things about this flag are worth stating where it lives, because both
   * are easy to get wrong from the outside:
   *
   *   - **It is a different dimension from `countryBound` above.** That one
   *     binds a muni club's *location pickers* to the country whose kunta funds
   *     it, and says nothing about who may enrol; this one says who may enrol,
   *     and says nothing about where the product runs (a fully remote club can
   *     be region-locked). Municipality clubs are excluded here precisely so
   *     nobody has to reconcile the two: their Finnish binding is already
   *     expressed, by the other mechanism.
   *   - **The lock is enforced in the UI alone, deliberately.** A family's
   *     location is self-attested and editable by them at any moment, so the
   *     shop's signup panel refusing to open is the whole mechanism — there is
   *     no server-side or database-side block, and its absence is a decision
   *     rather than an omission. A parent who restates their location can
   *     enrol, and a parent who moves after enroling keeps their seat. Known
   *     and accepted; see the `region_lock_country` column comment.
   */
  regionLockable: boolean;
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
    // Free-or-paid, defaulting to paid. A free club enrols exactly like a free
    // event — the enrollment path branches on billing_mode, never on type — so
    // the only thing "free club" needs is this chooser. When paid, the monthly
    // pricing shape below applies; when free, the pricing card doesn't render.
    billing: { mode: "free_or_paid" },
    pricingShape: "monthly",
    allowsRemote: true,
    allowsInPerson: true,
    requiresMunicipalityWhenOnline: false,
    countryBound: null,
    regionLockable: true,
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
    // The one type with no region lock: its country is already settled by
    // `countryBound` above, through an entirely separate mechanism.
    regionLockable: false,
    hasHolidayCalendars: true,
    allowedStartModes: ["date"],
    defaultBillingMode: "external_contract",
  },
  camp: {
    productType: "camp",
    i18nKey: "camp",
    routeSlug: "camps",
    scheduleShape: "multi_day_bounded",
    // Free-or-paid, defaulting to paid — the same chooser clubs and events get.
    // A free camp signs up through the billing_mode branch every free product
    // shares; when paid, the upfront total below applies.
    billing: { mode: "free_or_paid" },
    pricingShape: "upfront_total",
    allowsRemote: true,
    allowsInPerson: true,
    requiresMunicipalityWhenOnline: false,
    countryBound: null,
    regionLockable: true,
    hasHolidayCalendars: false,
    allowedStartModes: ["date", "date_and_threshold"],
    defaultBillingMode: "paid",
  },
  event: {
    productType: "event",
    i18nKey: "event",
    routeSlug: "events",
    // Events default to free; switching to paid uses upfront_total. The
    // pricing card only renders when the effective billing mode is "paid".
    pricingShape: "upfront_total",
    scheduleShape: "single_date",
    billing: { mode: "free_or_paid" },
    allowsRemote: true,
    allowsInPerson: true,
    requiresMunicipalityWhenOnline: false,
    countryBound: null,
    regionLockable: true,
    hasHolidayCalendars: false,
    allowedStartModes: ["date", "date_and_threshold", "threshold"],
    defaultBillingMode: "free",
  },
};

// ===== The free/paid choice =====
//
// Lives here rather than with the form's other chooser tuples because it feeds
// `effectiveBillingMode` below, which the form's capacity defaults and its
// validation both read. This module has no dependencies of its own, so it can
// sit under all of them.

// Listed as a module-level constant so the lint rule against literal strings
// (i18n) doesn't fire for these structural keys — same reason as the chooser
// tuples in product-form-state.ts.
export const PAID_MODE_VALUES = ["paid", "free"] as const;

export type PaidMode = (typeof PAID_MODE_VALUES)[number];

/**
 * Which billing mode is actually in force, given the type's billing option and
 * (for the types that offer a choice) the admin's free/paid pick. Municipality
 * clubs pin their mode, so `paidMode` is ignored for them.
 */
export function effectiveBillingMode(
  config: ProductTypeConfig,
  paidMode: PaidMode,
): BillingMode {
  if (config.billing.mode === "external_contract") return "external_contract";
  return paidMode === "free" ? "free" : "paid";
}

export function productTypeFromSlug(slug: string): ProductType | null {
  const entry = Object.values(PRODUCT_TYPE_CONFIG).find(
    (c) => c.routeSlug === slug
  );
  return entry?.productType ?? null;
}
