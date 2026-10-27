import { z } from "zod";
import { Constants } from "@/types";

/**
 * The wire contracts of the two reads the Klaviyo sync sends from:
 * `get_klaviyo_parent_snapshots` (what a parent's Klaviyo profile says) and
 * `get_klaviyo_events` (what happened to them).
 *
 * Both return `jsonb` the type generator sees only as `Json`, so these schemas
 * are the structure. They are written from the function bodies and the DB tests
 * parse real output through them, so the two cannot drift apart quietly. Both
 * reads are the service role's alone: a snapshot carries every gamer's birth
 * year and gender and the parent's phone.
 */

const enums = Constants.public.Enums;

/** A product as Klaviyo hears of it. `names` holds every locale's; pick with `resolveTranslation()`. */
export const klaviyoProduct = z.object({
  id: z.string(),
  names: z.array(z.object({ locale: z.string(), name: z.string() })),
  topic: z.enum(enums.product_topic),
  product_type: z.enum(enums.product_type),
  /** Only a seat on a `paid` product is a purchase. */
  billing_mode: z.enum(enums.billing_mode),
  /** Calendar dates, `YYYY-MM-DD`. */
  start_date: z.string(),
  end_date: z.string().nullable(),
  timezone: z.string(),
});

export type KlaviyoProduct = z.infer<typeof klaviyoProduct>;

const homeLocation = z.object({
  id: z.string(),
  /** The canonical name only: what Klaviyo is sent (`contract.ts`). */
  name: z.string(),
  country_code: z.string().nullable(),
});

/** A gamer as Klaviyo hears of them: no name and no birth month. */
const gamer = z.object({
  birth_year: z.number(),
  gender: z.enum(enums.gender_type).nullable(),
  /** Whether a Minecraft username is linked. */
  minecraft: z.boolean(),
  /** Whether a Roblox username is linked. */
  roblox: z.boolean(),
});

const participation = z.object({
  id: z.string(),
  status: z.enum(enums.participation_status),
  product: klaviyoProduct,
});

/** A family subscription: the seat it renews, and how far it is paid. */
const subscription = z.object({
  participation_id: z.string(),
  current_period_end: z.string().nullable(),
});

export const klaviyoParentSnapshot = z.object({
  profile: z.object({
    id: z.string(),
    email: z.string(),
    first_name: z.string(),
    last_name: z.string(),
    phone: z.string().nullable(),
    locale: z.string().nullable(),
    spoken_languages: z.array(z.enum(enums.spoken_language)),
    currency: z.string().nullable(),
    created_at: z.string(),
    email_verified_at: z.string().nullable(),
    home_location: homeLocation.nullable(),
  }),
  /** Write-once: what the account was opened from and under. */
  attribution: z.object({
    utm_source: z.string().nullable(),
    utm_medium: z.string().nullable(),
    utm_campaign: z.string().nullable(),
    utm_content: z.string().nullable(),
    utm_term: z.string().nullable(),
    signup_intent_kind: z.enum(["product", "municipality_club", "landing_page"]).nullable(),
    signup_intent_id: z.string().nullable(),
    /** The registration form's mailing-list answer; null when never asked. */
    registration_marketing_consent: z.boolean().nullable(),
  }),
  gamers: z.array(gamer),
  participations: z.array(participation),
  subscriptions: z.array(subscription),
  /** Refunded duplicate payments are left out of all three. */
  payments: z.object({
    first_at: z.string().nullable(),
    last_at: z.string().nullable(),
    /** Summed `amount_cents` per currency code (`eur`, `gbp`, `usd`). */
    lifetime_cents: z.record(z.string(), z.number()),
  }),
});

export type KlaviyoParentSnapshot = z.infer<typeof klaviyoParentSnapshot>;

/** One row of `get_klaviyo_parent_snapshots`. A requested id with no row is not a parent: delete its Klaviyo profile. */
export const klaviyoParentSnapshotRow = z.object({
  customer_id: z.string(),
  snapshot: klaviyoParentSnapshot,
});

const eventBase = {
  event_id: z.string(),
  /** `<kind>:<source id>` — Klaviyo's unique id for the event. */
  unique_id: z.string(),
  customer_id: z.string(),
  occurred_at: z.string(),
};

const eventProperties = {
  source_id: z.string(),
  /** Null when the event names no product, or the product is gone. */
  product: klaviyoProduct.nullable(),
};

/**
 * One row of `get_klaviyo_events`. A claimed id with no row belongs to a parent
 * who is gone: finish it unsent.
 */
export const klaviyoEventRow = z.discriminatedUnion("kind", [
  z.object({
    ...eventBase,
    kind: z.enum(["account_created", "waitlisted", "seat_offered"]),
    properties: z.object(eventProperties),
  }),
  z.object({
    ...eventBase,
    kind: z.literal("purchase"),
    properties: z.object({
      ...eventProperties,
      /** Whether the parent held no other seat on a paid product when this one was bought. */
      first_purchase: z.boolean(),
    }),
  }),
  z.object({
    ...eventBase,
    kind: z.literal("subscription_cancelled"),
    properties: z.object({
      ...eventProperties,
      status: z.enum(["canceling", "cancelled"]),
      current_period_end: z.string().nullable(),
    }),
  }),
]);

export type KlaviyoEventRow = z.infer<typeof klaviyoEventRow>;
