import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_ORIGIN } from "../../mocks/site-origin";
import {
  EVENT_METRICS,
  klaviyoEventFor,
  klaviyoListsFor,
  klaviyoProfileFor,
  newsletterProperties,
  subscriptionSourceOnSend,
} from "@/lib/klaviyo-sync/contract";
import type {
  KlaviyoEventRow,
  KlaviyoParentSnapshot,
  KlaviyoProduct,
} from "@/lib/klaviyo-sync/snapshot.contracts";

// An enrolment's `product_url` is the locale-prefixed, translated address the
// real path builder makes, which the setup's stub flattens; `next/navigation`
// comes with it, since the setup's partial mock would starve next-intl.
vi.unmock("@/i18n/navigation");
vi.unmock("next/navigation");

/**
 * **The Klaviyo contract is public, and these snapshots are its lock.**
 * Marketing builds segments, flows and templates on every name below inside
 * Klaviyo, where nothing in this repo can see them, so a renamed property or
 * metric silently empties whatever was built on it. Updating a snapshot here
 * is therefore a decision, not a chore: a rename ships as the new name sent
 * beside the old one, marketing is told, and the old one goes later
 * (`src/lib/klaviyo-sync/CLAUDE.md`).
 */

const PARENT = "6f2b8a7c-0d3e-4f51-9a6b-2c4d8e1f3a57";

const CLUB: KlaviyoProduct = {
  id: "0c8e5d1a-7b42-4e93-a6f0-3d9b2c7e8f14",
  names: [
    { locale: "en", name: "Minecraft Club Espoo" },
    { locale: "fi", name: "Minecraft-kerho Espoo" },
  ],
  topic: "minecraft_java",
  product_type: "consumer_club",
  billing_mode: "paid",
  delivery_mode: "in_person",
  spoken_language_code: "fi",
  location_name: "Espoo",
  start_date: "2026-09-01",
  end_date: "2027-05-31",
  timezone: "Europe/Helsinki",
};

const CAMP: KlaviyoProduct = {
  ...CLUB,
  id: "4a7f2e9c-1b53-4d86-b0e2-8c5f3a1d6e97",
  names: [{ locale: "en", name: "Roblox Summer Camp" }],
  topic: "roblox_studio",
  product_type: "camp",
  start_date: "2026-06-01",
  end_date: "2026-06-05",
};

const EVENT: KlaviyoProduct = {
  ...CAMP,
  id: "2f6a9d3e-8c14-4b70-a5e1-6d0b3c8f7a29",
  names: [{ locale: "en", name: "Fortnite Event" }],
  topic: "fortnite",
  product_type: "event",
  start_date: "2026-12-12",
  end_date: null,
};

const MUNICIPAL: KlaviyoProduct = {
  ...CLUB,
  id: "7d1e4b8a-3c62-4f95-9a0d-5e8b2c6f1a33",
  names: [{ locale: "en", name: "Vantaa Club" }],
  topic: "digital_safety",
  product_type: "municipality_club",
  billing_mode: "external_contract",
};

const FULL: KlaviyoParentSnapshot = {
  profile: {
    id: PARENT,
    email: "parent@example.com",
    first_name: "Aino",
    last_name: "Virtanen",
    phone: "358401234567",
    locale: "fi",
    spoken_languages: ["fi", "en"],
    currency: "eur",
    created_at: "2026-08-01T10:00:00+00:00",
    email_verified_at: "2026-08-01T10:05:00+00:00",
    home_location: {
      id: "9e3c1b7a-2d58-4f04-8a6e-5b1c7d3f9e20",
      name: "Espoo",
      country_code: "FI",
    },
  },
  attribution: {
    utm_source: "meta",
    utm_medium: "paid",
    utm_campaign: "autumn",
    utm_content: "video",
    utm_term: "minecraft",
    signup_intent_kind: "product",
    signup_intent_id: CLUB.id,
    registration_marketing_consent: true,
  },
  gamers: [{ birth_year: 2016, gender: "boy", minecraft: true, roblox: false }],
  participations: [
    { id: "p1", status: "active", product: CLUB },
    { id: "p2", status: "completed", product: CAMP },
    { id: "p3", status: "waitlisted", product: EVENT },
    { id: "p4", status: "active", product: MUNICIPAL },
  ],
  subscriptions: [
    // 23:30 UTC is already the next day in Helsinki.
    { participation_id: "p1", current_period_end: "2026-11-02T23:30:00+00:00" },
  ],
  payments: {
    first_at: "2026-05-02T10:00:00+00:00",
    last_at: "2026-10-02T10:00:00+00:00",
    lifetime_cents: { eur: 15_900 },
  },
};

const EMPTY: KlaviyoParentSnapshot = {
  ...FULL,
  profile: { ...FULL.profile, phone: null, locale: null, home_location: null },
  attribution: {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    signup_intent_kind: null,
    signup_intent_id: null,
    registration_marketing_consent: null,
  },
  gamers: [],
  participations: [],
  subscriptions: [],
  payments: { first_at: null, last_at: null, lifetime_cents: {} },
};

/** Each property's value type, so the snapshot pins names and shapes, not values. */
function shapes(properties: object): Record<string, string> {
  return Object.fromEntries(
    Object.entries(properties).map(([name, value]) => [name, shapeOf(value)]),
  );
}

function shapeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const first: unknown = value[0];
    if (first === undefined) return "array";
    return typeof first === "object" && first !== null
      ? `array<${JSON.stringify(shapes(first))}>`
      : `array<${typeof first}>`;
  }
  return typeof value;
}

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE_ORIGIN));
afterEach(() => vi.unstubAllEnvs());

describe("the profile", () => {
  it("names every property and its value type", () => {
    expect(shapes(klaviyoProfileFor(FULL).properties)).toMatchInlineSnapshot(`
      {
        "sog_account_created_at": "string",
        "sog_country": "string",
        "sog_currency": "string",
        "sog_email_verified_at": "string",
        "sog_env": "string",
        "sog_first_payment_at": "string",
        "sog_gamer_birth_years": "array<string>",
        "sog_gamer_count": "number",
        "sog_gamer_genders": "array<string>",
        "sog_home_location": "string",
        "sog_home_location_id": "string",
        "sog_last_payment_at": "string",
        "sog_linked_game_accounts": "array<string>",
        "sog_locale": "string",
        "sog_paid_until": "string",
        "sog_product_topics": "array<string>",
        "sog_product_types": "array<string>",
        "sog_registration_marketing_answer": "boolean",
        "sog_signup_intent": "string",
        "sog_signup_intent_id": "string",
        "sog_spoken_languages": "array<string>",
        "sog_total_paid_eur": "number",
        "sog_utm_campaign": "string",
        "sog_utm_content": "string",
        "sog_utm_medium": "string",
        "sog_utm_source": "string",
        "sog_utm_term": "string",
        "sog_waitlisted_products": "array<string>",
      }
    `);
  });

  it("carries Klaviyo's own attributes, the phone as E.164", () => {
    const { properties, ...attributes } = klaviyoProfileFor(FULL);
    void properties;
    expect(attributes).toEqual({
      email: "parent@example.com",
      externalId: PARENT,
      firstName: "Aino",
      lastName: "Virtanen",
      phoneNumber: "+358401234567",
      locale: "fi",
      country: "FI",
    });
  });

  it("lists every held seat's type and topic, and is paid until the latest paid seat's end", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const { properties } = klaviyoProfileFor(FULL);
    expect(properties).toMatchObject({
      sog_env: "production",
      sog_locale: "fi",
      sog_utm_source: "meta",
      // The municipality's contracted seat counts; the waitlisted event does not.
      sog_product_types: ["camp", "consumer_club", "municipality_club"],
      sog_product_topics: ["digital_safety", "minecraft_java", "roblox_studio"],
      // The club's paid period, as a Helsinki date; the camp ended in June,
      // and the municipality's seat is not paid.
      sog_paid_until: "2026-11-03",
      sog_waitlisted_products: ["Fortnite Event"],
      sog_total_paid_eur: 159,
      sog_registration_marketing_answer: true,
    });
  });

  it("is paid until an event without an end date's first day", () => {
    const { properties } = klaviyoProfileFor({
      ...FULL,
      participations: [{ id: "p3", status: "active", product: EVENT }],
    });
    expect(properties.sog_paid_until).toBe("2026-12-12");
  });

  it("is paid until nothing on free seats alone", () => {
    const { properties } = klaviyoProfileFor({
      ...FULL,
      participations: [{ id: "p3", status: "active", product: { ...EVENT, billing_mode: "free" } }],
    });
    expect(properties.sog_paid_until).toBeNull();
    expect(properties.sog_product_types).toEqual(["event"]);
  });

  it("lists one birth year per gamer, twins twice, and each gender once", () => {
    const { properties } = klaviyoProfileFor({
      ...FULL,
      gamers: [
        { birth_year: 2019, gender: null, minecraft: false, roblox: true },
        { birth_year: 2016, gender: "girl", minecraft: false, roblox: false },
        { birth_year: 2016, gender: "girl", minecraft: false, roblox: false },
        { birth_year: 2014, gender: "boy", minecraft: true, roblox: false },
      ],
    });
    expect(properties).toMatchObject({
      sog_gamer_count: 4,
      sog_gamer_birth_years: ["2014", "2016", "2016", "2019"],
      sog_gamer_genders: ["boy", "girl"],
      sog_linked_game_accounts: ["minecraft", "roblox"],
    });
  });

  it("is staging everywhere off production", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(klaviyoProfileFor(FULL).properties.sog_env).toBe("staging");
  });

  it("sends the same names with nothing to say, clearing what Klaviyo held", () => {
    const profile = klaviyoProfileFor(EMPTY);
    expect(Object.keys(profile.properties)).toEqual(
      Object.keys(klaviyoProfileFor(FULL).properties),
    );
    expect(profile.phoneNumber).toBeNull();
    expect(profile.country).toBeNull();
    expect(profile).not.toHaveProperty("locale");
    expect(profile.properties.sog_paid_until).toBeNull();
    expect(profile.properties.sog_gamer_birth_years).toEqual([]);
    expect(profile.properties.sog_gamer_genders).toEqual([]);
    expect(profile.properties.sog_total_paid_eur).toBe(0);
  });

  it("clears a stored number Klaviyo would refuse", () => {
    const profile = klaviyoProfileFor({ ...FULL, profile: { ...FULL.profile, phone: "0401234" } });
    expect(profile.phoneNumber).toBeNull();
  });
});

describe("the lists", () => {
  it("puts every parent on the account list, and a seat's kind on its own", () => {
    expect(klaviyoListsFor(FULL)).toEqual(["account", "club", "camp", "municipalClub"]);
    expect(klaviyoListsFor(EMPTY)).toEqual(["account"]);
  });

  it("counts a seat whatever its billing mode, an event included", () => {
    expect(
      klaviyoListsFor({
        ...FULL,
        participations: [
          { id: "p1", status: "active", product: { ...CLUB, billing_mode: "free" } },
          { id: "p3", status: "active", product: { ...EVENT, billing_mode: "free" } },
        ],
      }),
    ).toEqual(["account", "club", "event"]);
  });

  it("does not count a waitlisted seat", () => {
    expect(
      klaviyoListsFor({
        ...FULL,
        participations: [{ id: "p2", status: "waitlisted", product: CAMP }],
      }),
    ).toEqual(["account"]);
  });
});

describe("the events", () => {
  const base = {
    event_id: "e1",
    customer_id: PARENT,
    occurred_at: "2026-10-01T09:00:00+00:00",
  };
  const gamerSeat = {
    seat_holder: "gamer" as const,
    gamer_birth_year: 2016,
    gamer_gender: "boy" as const,
  };
  const enrolled = {
    ...base,
    kind: "enrolled",
    unique_id: "enrolled:p1",
    properties: {
      source_id: "p1",
      product: CLUB,
      ...gamerSeat,
      utm_source: "meta",
      utm_medium: "paid",
      utm_campaign: "autumn",
      utm_content: null,
      utm_term: null,
      marketing_opt_in: true,
    },
  } satisfies KlaviyoEventRow;
  const rows: KlaviyoEventRow[] = [
    {
      ...base,
      kind: "account_created",
      unique_id: `account_created:${PARENT}`,
      properties: { source_id: PARENT, product: null },
    },
    enrolled,
    {
      ...base,
      kind: "session",
      unique_id: "session:s1:p1:present",
      properties: {
        source_id: "a1",
        product: CLUB,
        ...gamerSeat,
        attended: true,
        session_date: "2026-09-02",
        session_starts_at: "2026-09-02T14:00:00+00:00",
      },
    },
    {
      ...base,
      kind: "waitlisted",
      unique_id: "waitlisted:p3",
      properties: {
        source_id: "p3",
        product: EVENT,
        utm_source: "meta",
        utm_medium: "paid",
        utm_campaign: "autumn",
        utm_content: null,
        utm_term: null,
        marketing_opt_in: true,
      },
    },
    {
      ...base,
      kind: "seat_offered",
      unique_id: "seat_offered:p3",
      properties: { source_id: "p3", product: EVENT },
    },
    {
      ...base,
      kind: "subscription_cancelled",
      unique_id: "subscription_cancelled:s1",
      properties: {
        source_id: "s1",
        product: CLUB,
        status: "canceling",
        current_period_end: "2026-11-02T10:00:00+00:00",
      },
    },
  ];

  it("names every metric", () => {
    expect(EVENT_METRICS).toMatchInlineSnapshot(`
      {
        "account_created": "SV Account Created",
        "enrolled": "SV Enrolled",
        "seat_offered": "SV Seat Offered",
        "session": "SV Session",
        "subscription_cancelled": "SV Subscription Cancelled",
        "waitlisted": "SV Waitlisted",
      }
    `);
  });

  it("names every event's properties and their value types", () => {
    expect(
      Object.fromEntries(
        rows.map((row) => {
          const event = klaviyoEventFor(row, FULL);
          return [event.metric, shapes(event.properties)];
        }),
      ),
    ).toMatchInlineSnapshot(`
      {
        "SV Account Created": {},
        "SV Enrolled": {
          "billing_mode": "string",
          "delivery_mode": "string",
          "gamer_birth_year": "number",
          "gamer_gender": "string",
          "location": "string",
          "product_id": "string",
          "product_name": "string",
          "product_type": "string",
          "product_url": "string",
          "seat_holder": "string",
          "spoken_language": "string",
          "topic": "string",
          "utm_campaign": "string",
          "utm_content": "null",
          "utm_medium": "string",
          "utm_source": "string",
          "utm_term": "null",
        },
        "SV Seat Offered": {
          "product_id": "string",
          "product_name": "string",
          "product_type": "string",
          "topic": "string",
        },
        "SV Session": {
          "attended": "boolean",
          "billing_mode": "string",
          "gamer_birth_year": "number",
          "gamer_gender": "string",
          "product_id": "string",
          "product_name": "string",
          "product_type": "string",
          "seat_holder": "string",
          "session_date": "string",
          "session_starts_at": "string",
          "topic": "string",
        },
        "SV Subscription Cancelled": {
          "ends_at": "string",
          "product_id": "string",
          "product_name": "string",
          "product_type": "string",
          "status": "string",
          "topic": "string",
        },
        "SV Waitlisted": {
          "product_id": "string",
          "product_name": "string",
          "product_type": "string",
          "topic": "string",
          "utm_campaign": "string",
          "utm_content": "null",
          "utm_medium": "string",
          "utm_source": "string",
          "utm_term": "null",
        },
      }
    `);
  });

  it("keeps the row's unique id and time, and words the product for the parent's locale", () => {
    expect(klaviyoEventFor(enrolled, FULL)).toEqual({
      metric: "SV Enrolled",
      uniqueId: "enrolled:p1",
      time: "2026-10-01T09:00:00+00:00",
      properties: {
        product_id: CLUB.id,
        product_name: "Minecraft-kerho Espoo",
        product_type: "consumer_club",
        topic: "minecraft_java",
        billing_mode: "paid",
        seat_holder: "gamer",
        gamer_birth_year: 2016,
        gamer_gender: "boy",
        delivery_mode: "in_person",
        location: "Espoo",
        spoken_language: "fi",
        product_url: `${SITE_ORIGIN}/fi/kauppa/${CLUB.id}`,
        utm_source: "meta",
        utm_medium: "paid",
        utm_campaign: "autumn",
        utm_content: null,
        utm_term: null,
      },
    });
  });

  it("links a municipality club's enrolment to its page at the shop address", () => {
    const event = klaviyoEventFor(
      { ...enrolled, properties: { ...enrolled.properties, product: MUNICIPAL } },
      { ...FULL, profile: { ...FULL.profile, locale: "en" } },
    );
    expect(event.properties.product_url).toBe(`${SITE_ORIGIN}/en/shop/${MUNICIPAL.id}`);
  });

  it("says nothing of a product that is gone, and of a parent's own seat's gamer", () => {
    const event = klaviyoEventFor(
      {
        ...enrolled,
        properties: {
          ...enrolled.properties,
          product: null,
          seat_holder: "parent",
          gamer_birth_year: null,
          gamer_gender: null,
        },
      },
      FULL,
    );
    expect(event.properties).toMatchObject({
      product_id: null,
      billing_mode: null,
      product_url: null,
      seat_holder: "parent",
      gamer_birth_year: null,
      gamer_gender: null,
    });
  });

  it("subscribes a ticked account creation, and an enrolment or a waitlist join that said yes, each under its own source", () => {
    const [created, , session] = rows;
    const waitlisted = rows.find((row) => row.kind === "waitlisted");
    if (waitlisted?.kind !== "waitlisted") throw new Error("fixture has no waitlisted row");
    const joined = (answer: boolean | null): KlaviyoEventRow => ({
      ...waitlisted,
      properties: { ...waitlisted.properties, marketing_opt_in: answer },
    });
    const answered = (answer: boolean | null): KlaviyoParentSnapshot => ({
      ...FULL,
      attribution: { ...FULL.attribution, registration_marketing_consent: answer },
    });
    const optIn = (answer: boolean | null): KlaviyoEventRow => ({
      ...enrolled,
      properties: { ...enrolled.properties, marketing_opt_in: answer },
    });
    expect(subscriptionSourceOnSend(created, answered(true))).toBe("Sogverse account registration");
    expect(subscriptionSourceOnSend(created, answered(false))).toBeNull();
    expect(subscriptionSourceOnSend(created, answered(null))).toBeNull();
    expect(subscriptionSourceOnSend(optIn(true), answered(null))).toBe("Sogverse product sign-up");
    expect(subscriptionSourceOnSend(optIn(false), answered(true))).toBeNull();
    expect(subscriptionSourceOnSend(optIn(null), answered(true))).toBeNull();
    expect(subscriptionSourceOnSend(joined(true), answered(null))).toBe("Sogverse product sign-up");
    expect(subscriptionSourceOnSend(joined(false), answered(true))).toBeNull();
    expect(subscriptionSourceOnSend(joined(null), answered(true))).toBeNull();
    expect(subscriptionSourceOnSend(session, answered(true))).toBeNull();
  });

  it("never sends the waitlist join's answer as an event property", () => {
    const waitlisted = rows.find((row) => row.kind === "waitlisted");
    if (waitlisted === undefined) throw new Error("fixture has no waitlisted row");
    expect(klaviyoEventFor(waitlisted, FULL).properties).not.toHaveProperty("marketing_opt_in");
  });
});

describe("the newsletter", () => {
  it("names the page and the visit's UTM values apart from the account's", () => {
    expect(
      newsletterProperties("page-id", { utm_source: "meta", utm_term: "roblox" }),
    ).toMatchInlineSnapshot(`
      {
        "sog_newsletter_page": "page-id",
        "sog_newsletter_utm_source": "meta",
        "sog_newsletter_utm_term": "roblox",
      }
    `);
  });
});
