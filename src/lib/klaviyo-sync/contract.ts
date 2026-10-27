import { formatInTimeZone } from "date-fns-tz";
import { isValidPhoneNumber } from "libphonenumber-js";
import { SUPPORTED_CURRENCIES } from "@/lib/constants/currency";
import { DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type { KlaviyoEvent, KlaviyoPropertyValue } from "@/lib/klaviyo";
import { isProductionDeployment } from "@/lib/seo/deployment";
import { UTM_FIELDS, UTM_QUERY_PARAMS, type UtmField } from "@/lib/utm";
import type {
  KlaviyoEventRow,
  KlaviyoParentSnapshot,
  KlaviyoProduct,
} from "./snapshot.contracts";

/**
 * **The Klaviyo contract: every name Sogverse writes into Klaviyo, and what it
 * holds.** The one place a snapshot becomes a profile, its lists and an event
 * row becomes an event, and the one place the newsletter form's property names
 * live.
 *
 * **These names are public.** Marketing builds segments, flows and templates
 * on them inside Klaviyo, where nothing here can see the dependency, so a
 * rename silently empties a segment. A name changes by adding the new one,
 * sending both, telling marketing, and only then dropping the old. The unit
 * test pins every name and its value type, so a change here fails it until
 * the test is changed with it on purpose.
 *
 * Every custom profile property is `sog_` and a snake_case name, every metric
 * `SV ` and a Title Case name, and an event's own properties are snake_case
 * with no prefix, since the metric carries it. Dates are ISO 8601 strings,
 * which Klaviyo reads as dates for segmenting, and never a countdown, which
 * would be stale the day after it was sent. An absent value is `null`, which
 * clears what Klaviyo held.
 */

export type KlaviyoProperties = Record<string, KlaviyoPropertyValue>;

// ---------------------------------------------------------------- names

export const PROFILE_PROPERTIES = {
  /** `production` or `staging` — one Klaviyo account holds both. */
  environment: "sog_env",
  accountCreatedAt: "sog_account_created_at",
  emailVerifiedAt: "sog_email_verified_at",
  /** The app locale the parent reads Sogverse in (`fi`, `en`, `sv`, `fr`). */
  locale: "sog_locale",
  spokenLanguages: "sog_spoken_languages",
  country: "sog_country",
  homeLocation: "sog_home_location",
  homeLocationId: "sog_home_location_id",
  currency: "sog_currency",
  firstUtm: {
    source: "sog_first_utm_source",
    medium: "sog_first_utm_medium",
    campaign: "sog_first_utm_campaign",
    content: "sog_first_utm_content",
    term: "sog_first_utm_term",
  } satisfies Record<UtmField, string>,
  /** What the parent set out for: `product`, `municipality_club` or `landing_page`. */
  signupIntent: "sog_signup_intent",
  signupIntentId: "sog_signup_intent_id",
  /**
   * The registration form's mailing-list answer, as a fact. Never consent:
   * consent is Klaviyo's own subscription status, sent once at account
   * creation for a yes.
   */
  registrationMarketingAnswer: "sog_registration_marketing_answer",
  gamerCount: "sog_gamer_count",
  /** Every gamer, as `{birth_year, gender}`. */
  gamers: "sog_gamers",
  /** `minecraft`, `roblox`: the game accounts any gamer has linked. */
  linkedGameAccounts: "sog_linked_game_accounts",
  firstPaymentAt: "sog_first_payment_at",
  /** Renewals included. */
  lastPaymentAt: "sog_last_payment_at",
  /** The product types of the seats held on paid products. */
  purchasedProductTypes: "sog_purchased_product_types",
  /** The topics of the seats held on paid products. */
  purchasedTopics: "sog_purchased_topics",
  /** The latest date any paid seat runs to, `YYYY-MM-DD`; null when none does. */
  activeUntil: "sog_active_until",
  waitlistedProducts: "sog_waitlisted_products",
} as const;

/** `sog_total_paid_eur`, one per supported currency, in major units. */
export function totalPaidProperty(currency: string): string {
  return `sog_total_paid_${currency.toLowerCase()}`;
}

/** The keys of each object in `sog_gamers`. */
export const GAMER_KEYS = {
  birthYear: "birth_year",
  gender: "gender",
} as const;

export const EVENT_METRICS = {
  account_created: "SV Account Created",
  purchase: "SV Purchase",
  waitlisted: "SV Waitlisted",
  seat_offered: "SV Seat Offered",
  subscription_cancelled: "SV Subscription Cancelled",
} as const satisfies Record<KlaviyoEventRow["kind"], string>;

export const EVENT_PROPERTIES = {
  productId: "product_id",
  /** The product's name in the parent's locale. */
  productName: "product_name",
  productType: "product_type",
  topic: "topic",
  /** On a purchase: whether the parent held no other seat on a paid product then. */
  firstPurchase: "first_purchase",
  /** On a cancellation: `canceling` (asked for) or `cancelled` (ended). */
  status: "status",
  /** On a cancellation: when the paid period ends. */
  endsAt: "ends_at",
} as const;

/** The newsletter form's properties: kept apart from the account's `first_utm` ones. */
export const NEWSLETTER_PROPERTIES = {
  /** The landing page's id: never changes, so a segment on it outlives a new slug. */
  page: "sog_newsletter_page",
  utm: {
    source: "sog_newsletter_utm_source",
    medium: "sog_newsletter_utm_medium",
    campaign: "sog_newsletter_utm_campaign",
    content: "sog_newsletter_utm_content",
    term: "sog_newsletter_utm_term",
  } satisfies Record<UtmField, string>,
} as const;

/**
 * The lists a parent belongs to in production, each a Klaviyo list whose id is
 * deployment configuration (`lists.server.ts`): `SV Account`, `SV Club`,
 * `SV Camp` and `SV Municipal club`. Membership is history — added, never
 * removed.
 */
export type KlaviyoList = "account" | "club" | "camp" | "municipalClub";

/** The source Klaviyo records on the consent a registration's tick gives. */
export const ACCOUNT_REGISTRATION_CUSTOM_SOURCE = "Sogverse account registration";

// ---------------------------------------------------------------- profile

/** The profile a parent's snapshot makes: Klaviyo's own attributes, and ours. */
export interface ParentProfile {
  email: string;
  externalId: string;
  firstName: string;
  lastName: string;
  /** E.164, or null to clear a number Klaviyo would refuse or the parent removed. */
  phoneNumber: string | null;
  locale?: string;
  country: string | null;
  properties: KlaviyoProperties;
}

/** The environment this deployment writes as. Everything off production is staging. */
export function klaviyoEnvironment(): "production" | "staging" {
  return isProductionDeployment() ? "production" : "staging";
}

/** The locale product names are written in: the parent's, else the default. */
function nameLocale(snapshot: KlaviyoParentSnapshot): SupportedLocale {
  const locale = snapshot.profile.locale;
  return locale !== null && isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
}

function productName(product: KlaviyoProduct, locale: SupportedLocale): string | null {
  return resolveTranslation(product.names, locale)?.name ?? null;
}

/** The stored digits as E.164, when they make a number Klaviyo will accept. */
function e164(phone: string | null): string | null {
  if (phone === null) return null;
  const number = `+${phone}`;
  return isValidPhoneNumber(number) ? number : null;
}

function distinctSorted<T extends string | number>(values: Iterable<T>): T[] {
  return [...new Set(values)].sort();
}

/** The seats held, as opposed to waited for. */
function heldSeats(snapshot: KlaviyoParentSnapshot) {
  return snapshot.participations.filter((p) => p.status !== "waitlisted");
}

/** The seats held on paid products: a free seat and a municipality's contracted one are no purchase. */
function paidSeats(snapshot: KlaviyoParentSnapshot) {
  return heldSeats(snapshot).filter((p) => p.product.billing_mode === "paid");
}

/**
 * The latest date any paid seat runs to: a club's, its subscription's paid
 * period end, as a date in the club's own zone; a camp's or an event's, its
 * last day (its first, when it has no end date).
 */
function activeUntil(snapshot: KlaviyoParentSnapshot): string | null {
  const ends = paidSeats(snapshot).flatMap((seat) => {
    const { product } = seat;
    if (product.product_type === "camp" || product.product_type === "event") {
      return [product.end_date ?? product.start_date];
    }
    return snapshot.subscriptions.flatMap((s) =>
      s.participation_id === seat.id && s.current_period_end !== null
        ? [formatInTimeZone(new Date(s.current_period_end), product.timezone, "yyyy-MM-dd")]
        : [],
    );
  });
  return ends.sort().at(-1) ?? null;
}

export function klaviyoProfileFor(snapshot: KlaviyoParentSnapshot): ParentProfile {
  const { profile, attribution, gamers, participations, payments } = snapshot;
  const locale = nameLocale(snapshot);
  const paid = paidSeats(snapshot);

  const firstUtm: KlaviyoProperties = {};
  for (const field of UTM_FIELDS) {
    firstUtm[PROFILE_PROPERTIES.firstUtm[field]] = attribution[`utm_${field}`];
  }

  const totalPaid: KlaviyoProperties = {};
  for (const currency of SUPPORTED_CURRENCIES) {
    totalPaid[totalPaidProperty(currency)] = (payments.lifetime_cents[currency] ?? 0) / 100;
  }

  const country = profile.home_location?.country_code ?? null;

  return {
    email: profile.email,
    externalId: profile.id,
    firstName: profile.first_name,
    lastName: profile.last_name,
    phoneNumber: e164(profile.phone),
    ...(profile.locale === null ? {} : { locale: profile.locale }),
    country,
    properties: {
      [PROFILE_PROPERTIES.environment]: klaviyoEnvironment(),
      [PROFILE_PROPERTIES.accountCreatedAt]: profile.created_at,
      [PROFILE_PROPERTIES.emailVerifiedAt]: profile.email_verified_at,
      [PROFILE_PROPERTIES.locale]: profile.locale,
      [PROFILE_PROPERTIES.spokenLanguages]: [...profile.spoken_languages].sort(),
      [PROFILE_PROPERTIES.country]: country,
      // The location's canonical name, never the parent's locale's version of
      // it: a segment on "Espoo" must match every parent in Espoo, whichever
      // language they read the site in.
      [PROFILE_PROPERTIES.homeLocation]: profile.home_location?.name ?? null,
      [PROFILE_PROPERTIES.homeLocationId]: profile.home_location?.id ?? null,
      [PROFILE_PROPERTIES.currency]: profile.currency,
      ...firstUtm,
      [PROFILE_PROPERTIES.signupIntent]: attribution.signup_intent_kind,
      [PROFILE_PROPERTIES.signupIntentId]: attribution.signup_intent_id,
      [PROFILE_PROPERTIES.registrationMarketingAnswer]:
        attribution.registration_marketing_consent,
      [PROFILE_PROPERTIES.gamerCount]: gamers.length,
      [PROFILE_PROPERTIES.gamers]: gamers.map((gamer) => ({
        [GAMER_KEYS.birthYear]: gamer.birth_year,
        [GAMER_KEYS.gender]: gamer.gender,
      })),
      [PROFILE_PROPERTIES.linkedGameAccounts]: [
        ...(gamers.some((g) => g.minecraft) ? ["minecraft"] : []),
        ...(gamers.some((g) => g.roblox) ? ["roblox"] : []),
      ],
      [PROFILE_PROPERTIES.firstPaymentAt]: payments.first_at,
      [PROFILE_PROPERTIES.lastPaymentAt]: payments.last_at,
      ...totalPaid,
      [PROFILE_PROPERTIES.purchasedProductTypes]: distinctSorted(
        paid.map((p) => p.product.product_type),
      ),
      [PROFILE_PROPERTIES.purchasedTopics]: distinctSorted(paid.map((p) => p.product.topic)),
      [PROFILE_PROPERTIES.activeUntil]: activeUntil(snapshot),
      [PROFILE_PROPERTIES.waitlistedProducts]: distinctSorted(
        participations
          .filter((p) => p.status === "waitlisted")
          .map((p) => productName(p.product, locale))
          .filter((name): name is string => name !== null),
      ),
    },
  };
}

/**
 * The production lists this parent belongs to: `SV Account` always, `SV Club`
 * for a paid consumer club seat, `SV Camp` for a paid camp seat, and
 * `SV Municipal club` for any municipality club seat. The sync only ever adds,
 * so a seat that has since ended keeps its list.
 */
export function klaviyoListsFor(snapshot: KlaviyoParentSnapshot): KlaviyoList[] {
  const paidTypes = new Set(paidSeats(snapshot).map((p) => p.product.product_type));
  const heldTypes = new Set(heldSeats(snapshot).map((p) => p.product.product_type));
  return [
    "account",
    ...(paidTypes.has("consumer_club") ? (["club"] as const) : []),
    ...(paidTypes.has("camp") ? (["camp"] as const) : []),
    ...(heldTypes.has("municipality_club") ? (["municipalClub"] as const) : []),
  ];
}

// ---------------------------------------------------------------- events

function productProperties(
  product: KlaviyoProduct | null,
  locale: SupportedLocale,
): KlaviyoProperties {
  return {
    [EVENT_PROPERTIES.productId]: product?.id ?? null,
    [EVENT_PROPERTIES.productName]: product === null ? null : productName(product, locale),
    [EVENT_PROPERTIES.productType]: product?.product_type ?? null,
    [EVENT_PROPERTIES.topic]: product?.topic ?? null,
  };
}

/**
 * The Klaviyo event an event row makes, worded for the parent it happened to:
 * product names in their locale.
 */
export function klaviyoEventFor(
  row: KlaviyoEventRow,
  snapshot: KlaviyoParentSnapshot,
): KlaviyoEvent {
  const locale = nameLocale(snapshot);
  const base = {
    metric: EVENT_METRICS[row.kind],
    uniqueId: row.unique_id,
    time: row.occurred_at,
  };

  switch (row.kind) {
    case "account_created":
      return { ...base, properties: {} };
    case "waitlisted":
    case "seat_offered":
      return { ...base, properties: productProperties(row.properties.product, locale) };
    case "purchase":
      return {
        ...base,
        properties: {
          ...productProperties(row.properties.product, locale),
          [EVENT_PROPERTIES.firstPurchase]: row.properties.first_purchase,
        },
      };
    case "subscription_cancelled":
      return {
        ...base,
        properties: {
          ...productProperties(row.properties.product, locale),
          [EVENT_PROPERTIES.status]: row.properties.status,
          [EVENT_PROPERTIES.endsAt]: row.properties.current_period_end,
        },
      };
  }
}

/**
 * Whether sending this event also subscribes the parent to email marketing:
 * only their account's creation, and only when they ticked the registration
 * form's box. Every other answer — unticked, never asked — leaves consent
 * alone.
 */
export function subscribesOnSend(row: KlaviyoEventRow, snapshot: KlaviyoParentSnapshot): boolean {
  return (
    row.kind === "account_created" && snapshot.attribution.registration_marketing_consent === true
  );
}

// ---------------------------------------------------------------- newsletter

/**
 * The properties a newsletter sign-up writes: the landing page's id, and the
 * visit's UTM values as the consent-gated metadata builder returned them
 * (keyed by their query-parameter names).
 */
export function newsletterProperties(
  pageId: string,
  utmMetadata: Readonly<Partial<Record<string, string>>>,
): Record<string, string> {
  const properties: Record<string, string> = { [NEWSLETTER_PROPERTIES.page]: pageId };
  for (const field of UTM_FIELDS) {
    const value = utmMetadata[UTM_QUERY_PARAMS[field]];
    if (value !== undefined) properties[NEWSLETTER_PROPERTIES.utm[field]] = value;
  }
  return properties;
}
