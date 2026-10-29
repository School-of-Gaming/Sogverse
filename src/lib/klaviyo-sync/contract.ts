import { formatInTimeZone } from "date-fns-tz";
import { isValidPhoneNumber } from "libphonenumber-js";
import { getPathname } from "@/i18n/navigation";
import { weekdayOf } from "@/lib/calendar-date";
import { SUPPORTED_CURRENCIES } from "@/lib/constants/currency";
import { DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale } from "@/lib/constants/locales";
import { ROUTES } from "@/lib/constants/routes";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type { KlaviyoEvent, KlaviyoPropertyValue } from "@/lib/klaviyo";
import { dateTimeInstant } from "@/lib/schedule-occurrence";
import { isProductionDeployment } from "@/lib/seo/deployment";
import { firstSessionDate } from "@/lib/session-dates";
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
 * **Sogverse sends facts; Klaviyo derives what its own filters can.** A
 * gamer is a birth year and a gender, never a computed age; a seat is its
 * product's type, topic and billing mode and who holds it, never "a purchase"
 * or "a first purchase", which a segment over the enrolment events answers by
 * itself.
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
  /** The UTM tag of the visit the account was created on. */
  utm: {
    source: "sog_utm_source",
    medium: "sog_utm_medium",
    campaign: "sog_utm_campaign",
    content: "sog_utm_content",
    term: "sog_utm_term",
  } satisfies Record<UtmField, string>,
  /** What the parent set out for: `product`, `municipality_club` or `landing_page`. */
  signupIntent: "sog_signup_intent",
  signupIntentId: "sog_signup_intent_id",
  /**
   * The registration form's mailing-list answer, as a fact. Never consent:
   * consent is Klaviyo's own subscription status, sent once for a yes, with
   * the account's creation event.
   */
  registrationMarketingAnswer: "sog_registration_marketing_answer",
  gamerCount: "sog_gamer_count",
  /**
   * Every gamer's birth year as a string, one entry per gamer (twins twice),
   * sorted. Strings, because Klaviyo matches a list property's items exactly:
   * a segment asks whether it contains `2016`.
   */
  gamerBirthYears: "sog_gamer_birth_years",
  /** The gamers' genders (`boy`, `girl`, `non_binary`), distinct and sorted; a gamer with none adds nothing. */
  gamerGenders: "sog_gamer_genders",
  /** `minecraft`, `roblox`: the game accounts any gamer has linked. */
  linkedGameAccounts: "sog_linked_game_accounts",
  firstPaymentAt: "sog_first_payment_at",
  /** Renewals included. */
  lastPaymentAt: "sog_last_payment_at",
  /** The product types of every seat held now (not waitlisted), whatever its billing mode. */
  productTypes: "sog_product_types",
  /** The topics of every seat held now (not waitlisted), whatever its billing mode. */
  productTopics: "sog_product_topics",
  /** The latest date any seat on a paid product is paid to, `YYYY-MM-DD`; null when none is. */
  paidUntil: "sog_paid_until",
  waitlistedProducts: "sog_waitlisted_products",
} as const;

/** `sog_total_paid_eur`, one per supported currency, in major units. */
export function totalPaidProperty(currency: string): string {
  return `sog_total_paid_${currency.toLowerCase()}`;
}

export const EVENT_METRICS = {
  account_created: "SV Account Created",
  /** One per seat held, on a product of any billing mode. */
  enrolled: "SV Enrolled",
  /** One per attendance mark: attended, or marked absent. */
  session: "SV Session",
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
  /** On an enrolment and a session: `paid`, `free` or `external_contract`. */
  billingMode: "billing_mode",
  /** On an enrolment and a session: who holds the seat, `parent` or `gamer`. */
  seatHolder: "seat_holder",
  /** On an enrolment and a session: the gamer's birth year; null on a parent's own seat. */
  gamerBirthYear: "gamer_birth_year",
  /** On an enrolment and a session: the gamer's gender; null on a parent's own seat or a gamer with none. */
  gamerGender: "gamer_gender",
  /**
   * On an enrolment: the product's first session, an ISO instant — the first
   * slot on or after its start date, at that slot's time in the product's
   * zone. Null when the product has no slots.
   */
  startsAt: "starts_at",
  /** On an enrolment. */
  deliveryMode: "delivery_mode",
  /** On an enrolment: the location's canonical name; null when the product has none. */
  location: "location",
  /** On an enrolment: the spoken language code the product is taught in. */
  spokenLanguage: "spoken_language",
  /** On an enrolment: the absolute address of the product's page, in the parent's locale. */
  productUrl: "product_url",
  /** On an enrolment: the UTM tag of the visit that led to the booking. */
  utm: {
    source: "utm_source",
    medium: "utm_medium",
    campaign: "utm_campaign",
    content: "utm_content",
    term: "utm_term",
  } satisfies Record<UtmField, string>,
  /** On a session: whether the seat holder was there. */
  attended: "attended",
  /** On a session: its date in the product's zone, `YYYY-MM-DD`. */
  sessionDate: "session_date",
  /** On a session: its scheduled start, an ISO instant. */
  sessionStartsAt: "session_starts_at",
  /** On a cancellation: `canceling` (asked for) or `cancelled` (ended). */
  status: "status",
  /** On a cancellation: when the paid period ends. */
  endsAt: "ends_at",
} as const;

/** The newsletter form's properties: kept apart from the account's `sog_utm_` ones. */
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
 * `SV Camp`, `SV Event` and `SV Municipal club`. Membership is history —
 * added, never removed.
 */
export type KlaviyoList = "account" | "club" | "camp" | "event" | "municipalClub";

/** The source Klaviyo records on the consent a registration's tick gives. */
export const ACCOUNT_REGISTRATION_CUSTOM_SOURCE = "Sogverse account registration";

/** The source Klaviyo records on the consent a yes to a product's mailing ask gives. */
export const PRODUCT_SIGNUP_CUSTOM_SOURCE = "Sogverse product sign-up";

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

/**
 * The latest date any seat on a paid product is paid to: a club's, its
 * subscription's paid period end, as a date in the club's own zone; a camp's
 * or an event's, its last day (its first, when it has no end date).
 */
function paidUntil(snapshot: KlaviyoParentSnapshot): string | null {
  const paid = heldSeats(snapshot).filter((p) => p.product.billing_mode === "paid");
  const ends = paid.flatMap((seat) => {
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
  const held = heldSeats(snapshot);

  const utm: KlaviyoProperties = {};
  for (const field of UTM_FIELDS) {
    utm[PROFILE_PROPERTIES.utm[field]] = attribution[`utm_${field}`];
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
      ...utm,
      [PROFILE_PROPERTIES.signupIntent]: attribution.signup_intent_kind,
      [PROFILE_PROPERTIES.signupIntentId]: attribution.signup_intent_id,
      [PROFILE_PROPERTIES.registrationMarketingAnswer]:
        attribution.registration_marketing_consent,
      [PROFILE_PROPERTIES.gamerCount]: gamers.length,
      [PROFILE_PROPERTIES.gamerBirthYears]: gamers.map((g) => String(g.birth_year)).sort(),
      [PROFILE_PROPERTIES.gamerGenders]: distinctSorted(
        gamers.flatMap((g) => (g.gender === null ? [] : [g.gender])),
      ),
      [PROFILE_PROPERTIES.linkedGameAccounts]: [
        ...(gamers.some((g) => g.minecraft) ? ["minecraft"] : []),
        ...(gamers.some((g) => g.roblox) ? ["roblox"] : []),
      ],
      [PROFILE_PROPERTIES.firstPaymentAt]: payments.first_at,
      [PROFILE_PROPERTIES.lastPaymentAt]: payments.last_at,
      ...totalPaid,
      [PROFILE_PROPERTIES.productTypes]: distinctSorted(held.map((p) => p.product.product_type)),
      [PROFILE_PROPERTIES.productTopics]: distinctSorted(held.map((p) => p.product.topic)),
      [PROFILE_PROPERTIES.paidUntil]: paidUntil(snapshot),
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
 * The production lists this parent belongs to: `SV Account` always, and for
 * every seat held, whatever its billing mode, its type's list — `SV Club`,
 * `SV Camp`, `SV Event` or `SV Municipal club`. The sync only ever adds, so a
 * seat that has since ended keeps its list.
 */
export function klaviyoListsFor(snapshot: KlaviyoParentSnapshot): KlaviyoList[] {
  const held = new Set(heldSeats(snapshot).map((p) => p.product.product_type));
  return [
    "account",
    ...(held.has("consumer_club") ? (["club"] as const) : []),
    ...(held.has("camp") ? (["camp"] as const) : []),
    ...(held.has("event") ? (["event"] as const) : []),
    ...(held.has("municipality_club") ? (["municipalClub"] as const) : []),
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

/** What an enrolment and a session say about the seat: its product, its billing mode, and who holds it. */
function seatProperties(
  properties: Extract<KlaviyoEventRow, { kind: "enrolled" | "session" }>["properties"],
  locale: SupportedLocale,
): KlaviyoProperties {
  return {
    ...productProperties(properties.product, locale),
    [EVENT_PROPERTIES.billingMode]: properties.product?.billing_mode ?? null,
    [EVENT_PROPERTIES.seatHolder]: properties.seat_holder,
    [EVENT_PROPERTIES.gamerBirthYear]: properties.gamer_birth_year,
    [EVENT_PROPERTIES.gamerGender]: properties.gamer_gender,
  };
}

/**
 * The product's first session, as an ISO instant: the first date on or after
 * its start date that one of its slots falls on, at the earliest of that
 * day's slot times, read in the product's own zone — so the offset is the one
 * in force on that date. Null when the product has no slots, and so no time
 * of day to pin.
 */
export function productStartsAt(product: KlaviyoProduct): string | null {
  if (product.slots.length === 0) return null;
  const date = firstSessionDate(
    product.start_date,
    product.slots.map((slot) => slot.weekday),
  );
  const [startTime] = product.slots
    .filter((slot) => slot.weekday === weekdayOf(date))
    .map((slot) => slot.start_time)
    .sort();
  return dateTimeInstant(date, startTime, product.timezone).toISOString();
}

/**
 * The absolute address of the product's page in the parent's locale, on the
 * canonical site origin. It is the shop address for every type: a
 * municipality club's page opens there too, and its town's `/schools/<slug>`
 * address would need the town's name in the parent's locale, which the
 * product document does not carry.
 */
function productUrl(product: KlaviyoProduct, locale: SupportedLocale): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl === undefined || !URL.canParse(siteUrl)) {
    throw new Error("NEXT_PUBLIC_SITE_URL is not a URL");
  }
  const path = getPathname({ href: ROUTES.shopProduct(product.id), locale });
  return new URL(path, siteUrl).toString();
}

/**
 * The Klaviyo event an event row makes, worded for the parent it happened to:
 * product names and the product's address in their locale.
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
    case "enrolled": {
      const { product } = row.properties;
      const utm: KlaviyoProperties = {};
      for (const field of UTM_FIELDS) {
        utm[EVENT_PROPERTIES.utm[field]] = row.properties[`utm_${field}`];
      }
      return {
        ...base,
        properties: {
          ...seatProperties(row.properties, locale),
          [EVENT_PROPERTIES.startsAt]: product === null ? null : productStartsAt(product),
          [EVENT_PROPERTIES.deliveryMode]: product?.delivery_mode ?? null,
          [EVENT_PROPERTIES.location]: product?.location_name ?? null,
          [EVENT_PROPERTIES.spokenLanguage]: product?.spoken_language_code ?? null,
          [EVENT_PROPERTIES.productUrl]: product === null ? null : productUrl(product, locale),
          ...utm,
        },
      };
    }
    case "session":
      return {
        ...base,
        properties: {
          ...seatProperties(row.properties, locale),
          [EVENT_PROPERTIES.attended]: row.properties.attended,
          [EVENT_PROPERTIES.sessionDate]: row.properties.session_date,
          [EVENT_PROPERTIES.sessionStartsAt]: row.properties.session_starts_at,
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
 * The custom source of the email-marketing subscription sending this event
 * also makes, or null when it makes none. Two answers subscribe: the
 * registration form's ticked box, sent with the account's creation, and a yes
 * to a product's School of Gaming mailing ask, sent with the event the
 * booking's own insert filed — the seat's enrolment, or the waitlist join.
 * Every other answer — unticked, no, never asked — leaves consent alone.
 */
export function subscriptionSourceOnSend(
  row: KlaviyoEventRow,
  snapshot: KlaviyoParentSnapshot,
): string | null {
  switch (row.kind) {
    case "account_created":
      return snapshot.attribution.registration_marketing_consent === true
        ? ACCOUNT_REGISTRATION_CUSTOM_SOURCE
        : null;
    case "enrolled":
    case "waitlisted":
      return row.properties.marketing_opt_in === true ? PRODUCT_SIGNUP_CUSTOM_SOURCE : null;
    default:
      return null;
  }
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
