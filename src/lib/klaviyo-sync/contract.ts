import { isValidPhoneNumber } from "react-phone-number-input";
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
 * holds.** The one place a snapshot becomes a profile and an event row becomes
 * an event, and the one place the newsletter form's property names live.
 *
 * **These names are public.** Marketing builds segments, flows and templates
 * on them inside Klaviyo, where nothing here can see the dependency, so a
 * rename silently empties a segment. A name changes by adding the new one,
 * sending both, telling marketing, and only then dropping the old. The unit
 * test pins every name and its value type, so a change here fails it until
 * the test is changed with it on purpose.
 *
 * Every custom profile property is `Sogverse ` and a Title Case name, so it
 * sorts together in Klaviyo's property list and never collides with a property
 * another tool writes; an event's own properties need no prefix, since its
 * metric already carries it. Dates are ISO 8601 strings, which Klaviyo reads
 * as dates for segmenting, and never a countdown, which would be stale the day
 * after it was sent. An absent value is `null`, which clears what Klaviyo held.
 */

export type KlaviyoProperties = Record<string, KlaviyoPropertyValue>;

// ---------------------------------------------------------------- names

export const PROFILE_PROPERTIES = {
  /** Always true: this profile is a Sogverse parent account's. */
  account: "Sogverse Account",
  /** `production` or `staging` — one Klaviyo account holds both. */
  environment: "Sogverse Environment",
  accountCreated: "Sogverse Account Created",
  emailVerified: "Sogverse Email Verified",
  spokenLanguages: "Sogverse Spoken Languages",
  currency: "Sogverse Currency",
  homeLocation: "Sogverse Home Location",
  homeLocationId: "Sogverse Home Location Id",
  country: "Sogverse Country",
  signupUtm: {
    source: "Sogverse Signup UTM Source",
    medium: "Sogverse Signup UTM Medium",
    campaign: "Sogverse Signup UTM Campaign",
    content: "Sogverse Signup UTM Content",
    term: "Sogverse Signup UTM Term",
  } satisfies Record<UtmField, string>,
  /** What the parent set out for: `product`, `municipality_club` or `landing_page`. */
  signupIntent: "Sogverse Signup Intent",
  signupIntentId: "Sogverse Signup Intent Id",
  /**
   * The registration form's mailing-list answer, as a fact. Never consent:
   * consent is Klaviyo's own subscription status, sent once at account
   * creation for a yes.
   */
  registrationMarketingAnswer: "Sogverse Registration Marketing Answer",
  gamerCount: "Sogverse Gamer Count",
  /** Every gamer, as objects for templates. */
  gamers: "Sogverse Gamers",
  gamerBirthYears: "Sogverse Gamer Birth Years",
  gamerGenders: "Sogverse Gamer Genders",
  /** `minecraft`, `roblox`: the game accounts any gamer has linked. */
  linkedGameAccounts: "Sogverse Linked Game Accounts",
  /** Every product topic the family has held or waited for a seat on. */
  games: "Sogverse Games",
  activeProducts: "Sogverse Active Products",
  activeProductTypes: "Sogverse Active Product Types",
  pastProducts: "Sogverse Past Products",
  waitlistedProducts: "Sogverse Waitlisted Products",
  subscriptionStatus: "Sogverse Subscription Status",
  /** The next renewal of a live subscription; null when none renews. */
  subscriptionRenews: "Sogverse Subscription Renews",
  paymentCount: "Sogverse Payment Count",
  firstPayment: "Sogverse First Payment",
  lastPayment: "Sogverse Last Payment",
} as const;

/** `Sogverse Lifetime Spend EUR`, one per supported currency, in major units. */
export function lifetimeSpendProperty(currency: string): string {
  return `Sogverse Lifetime Spend ${currency.toUpperCase()}`;
}

/** The keys of each object in `Sogverse Gamers`. */
export const GAMER_KEYS = {
  firstName: "First Name",
  birthYear: "Birth Year",
  birthMonth: "Birth Month",
  gender: "Gender",
  minecraft: "Minecraft",
  roblox: "Roblox",
} as const;

export const EVENT_METRICS = {
  account_created: "Sogverse Account Created",
  enrolled: "Sogverse Enrolled",
  waitlisted: "Sogverse Waitlisted",
  seat_offered: "Sogverse Seat Offered",
  payment: "Sogverse Payment",
  subscription_cancelled: "Sogverse Subscription Cancelled",
} as const satisfies Record<KlaviyoEventRow["kind"], string>;

export const EVENT_PROPERTIES = {
  product: "Product",
  productId: "Product Id",
  productType: "Product Type",
  topic: "Topic",
  startDate: "Start Date",
  endDate: "End Date",
  status: "Status",
  /** The gamer the seat is for; null when the seat is the parent's own. */
  gamerFirstName: "Gamer First Name",
  amount: "Amount",
  currency: "Currency",
  purpose: "Purpose",
  ends: "Ends",
} as const;

/** The newsletter form's properties: kept apart from the account's `Signup` ones. */
export const NEWSLETTER_PROPERTIES = {
  /** The landing page's id: never changes, so a segment on it outlives a new slug. */
  page: "Sogverse Newsletter Page",
  utm: {
    source: "Sogverse Newsletter UTM Source",
    medium: "Sogverse Newsletter UTM Medium",
    campaign: "Sogverse Newsletter UTM Campaign",
    content: "Sogverse Newsletter UTM Content",
    term: "Sogverse Newsletter UTM Term",
  } satisfies Record<UtmField, string>,
} as const;

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

/** Live first, then the ones that still say something about the family's billing. */
const SUBSCRIPTION_STATUS_ORDER = [
  "active",
  "past_due",
  "canceling",
  "incomplete",
  "cancelled",
] as const;

export function klaviyoProfileFor(snapshot: KlaviyoParentSnapshot): ParentProfile {
  const { profile, attribution, gamers, participations, subscriptions, payments } = snapshot;
  const locale = nameLocale(snapshot);

  const namesIn = (state: "active" | "past" | "waitlisted") =>
    distinctSorted(
      participations
        .filter((p) => p.state === state)
        .map((p) => productName(p.product, locale))
        .filter((name): name is string => name !== null),
    );

  const statuses = new Set(subscriptions.map((s) => s.status));
  const renewals = subscriptions
    .flatMap((s) =>
      (s.status === "active" || s.status === "past_due") && s.current_period_end !== null
        ? [s.current_period_end]
        : [],
    )
    .sort();

  const signupUtm: KlaviyoProperties = {};
  for (const field of UTM_FIELDS) {
    signupUtm[PROFILE_PROPERTIES.signupUtm[field]] = attribution[`utm_${field}`];
  }

  const lifetimeSpend: KlaviyoProperties = {};
  for (const currency of SUPPORTED_CURRENCIES) {
    lifetimeSpend[lifetimeSpendProperty(currency)] = (payments.lifetime_cents[currency] ?? 0) / 100;
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
      [PROFILE_PROPERTIES.account]: true,
      [PROFILE_PROPERTIES.environment]: klaviyoEnvironment(),
      [PROFILE_PROPERTIES.accountCreated]: profile.created_at,
      [PROFILE_PROPERTIES.emailVerified]: profile.email_verified_at,
      [PROFILE_PROPERTIES.spokenLanguages]: [...profile.spoken_languages].sort(),
      [PROFILE_PROPERTIES.currency]: profile.currency,
      // The location's canonical name, never the parent's locale's version of
      // it: a segment on "Espoo" must match every parent in Espoo, whichever
      // language they read the site in.
      [PROFILE_PROPERTIES.homeLocation]: profile.home_location?.name ?? null,
      [PROFILE_PROPERTIES.homeLocationId]: profile.home_location?.id ?? null,
      [PROFILE_PROPERTIES.country]: country,
      ...signupUtm,
      [PROFILE_PROPERTIES.signupIntent]: attribution.signup_intent_kind,
      [PROFILE_PROPERTIES.signupIntentId]: attribution.signup_intent_id,
      [PROFILE_PROPERTIES.registrationMarketingAnswer]:
        attribution.registration_marketing_consent,
      [PROFILE_PROPERTIES.gamerCount]: gamers.length,
      [PROFILE_PROPERTIES.gamers]: gamers.map((gamer) => ({
        [GAMER_KEYS.firstName]: gamer.first_name,
        [GAMER_KEYS.birthYear]: gamer.birth_year,
        [GAMER_KEYS.birthMonth]: gamer.birth_month,
        [GAMER_KEYS.gender]: gamer.gender,
        [GAMER_KEYS.minecraft]: gamer.minecraft,
        [GAMER_KEYS.roblox]: gamer.roblox,
      })),
      [PROFILE_PROPERTIES.gamerBirthYears]: distinctSorted(gamers.map((g) => g.birth_year)),
      [PROFILE_PROPERTIES.gamerGenders]: distinctSorted(
        gamers.flatMap((g) => (g.gender === null ? [] : [g.gender])),
      ),
      [PROFILE_PROPERTIES.linkedGameAccounts]: [
        ...(gamers.some((g) => g.minecraft) ? ["minecraft"] : []),
        ...(gamers.some((g) => g.roblox) ? ["roblox"] : []),
      ],
      [PROFILE_PROPERTIES.games]: distinctSorted(participations.map((p) => p.product.topic)),
      [PROFILE_PROPERTIES.activeProducts]: namesIn("active"),
      [PROFILE_PROPERTIES.activeProductTypes]: distinctSorted(
        participations.filter((p) => p.state === "active").map((p) => p.product.product_type),
      ),
      [PROFILE_PROPERTIES.pastProducts]: namesIn("past"),
      [PROFILE_PROPERTIES.waitlistedProducts]: namesIn("waitlisted"),
      [PROFILE_PROPERTIES.subscriptionStatus]:
        SUBSCRIPTION_STATUS_ORDER.find((status) => statuses.has(status)) ?? null,
      [PROFILE_PROPERTIES.subscriptionRenews]: renewals.at(0) ?? null,
      [PROFILE_PROPERTIES.paymentCount]: payments.count,
      [PROFILE_PROPERTIES.firstPayment]: payments.first_at,
      [PROFILE_PROPERTIES.lastPayment]: payments.last_at,
      ...lifetimeSpend,
    },
  };
}

// ---------------------------------------------------------------- events

function productProperties(
  product: KlaviyoProduct | null,
  locale: SupportedLocale,
): KlaviyoProperties {
  return {
    [EVENT_PROPERTIES.product]: product === null ? null : productName(product, locale),
    [EVENT_PROPERTIES.productId]: product?.id ?? null,
    [EVENT_PROPERTIES.productType]: product?.product_type ?? null,
    [EVENT_PROPERTIES.topic]: product?.topic ?? null,
    [EVENT_PROPERTIES.startDate]: product?.start_date ?? null,
    [EVENT_PROPERTIES.endDate]: product?.end_date ?? null,
  };
}

/**
 * The Klaviyo event an event row makes, worded for the parent it happened to
 * — product names in their locale, the gamer by first name.
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
    case "enrolled":
    case "waitlisted":
    case "seat_offered": {
      const gamer = snapshot.gamers.find((g) => g.id === row.properties.participant_id);
      return {
        ...base,
        properties: {
          ...productProperties(row.properties.product, locale),
          [EVENT_PROPERTIES.status]: row.properties.status,
          [EVENT_PROPERTIES.gamerFirstName]: gamer?.first_name ?? null,
        },
      };
    }
    case "payment": {
      const amount = row.properties.amount_cents / 100;
      const currency = row.properties.currency.toUpperCase();
      return {
        ...base,
        properties: {
          ...productProperties(row.properties.product, locale),
          [EVENT_PROPERTIES.amount]: amount,
          [EVENT_PROPERTIES.currency]: currency,
          [EVENT_PROPERTIES.purpose]: row.properties.purpose,
        },
        value: { amount, currency },
      };
    }
    case "subscription_cancelled":
      return {
        ...base,
        properties: {
          ...productProperties(row.properties.product, locale),
          [EVENT_PROPERTIES.status]: row.properties.status,
          [EVENT_PROPERTIES.ends]: row.properties.current_period_end,
          [EVENT_PROPERTIES.currency]: row.properties.currency.toUpperCase(),
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
