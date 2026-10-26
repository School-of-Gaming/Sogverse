import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EVENT_METRICS,
  klaviyoEventFor,
  klaviyoProfileFor,
  newsletterProperties,
  subscribesOnSend,
} from "@/lib/klaviyo-sync/contract";
import type {
  KlaviyoEventRow,
  KlaviyoParentSnapshot,
  KlaviyoProduct,
} from "@/lib/klaviyo-sync/snapshot.contracts";

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
const GAMER = "b1d4e7a2-5c38-4f69-8e0a-7d2c5b9f1e43";

const CLUB: KlaviyoProduct = {
  id: "0c8e5d1a-7b42-4e93-a6f0-3d9b2c7e8f14",
  names: [
    { locale: "en", name: "Minecraft Club Espoo" },
    { locale: "fi", name: "Minecraft-kerho Espoo" },
  ],
  topic: "minecraft_java",
  product_type: "consumer_club",
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
  gamers: [
    {
      id: GAMER,
      first_name: "Eetu",
      birth_year: 2016,
      birth_month: 4,
      gender: "boy",
      minecraft: true,
      roblox: false,
    },
  ],
  participations: [
    {
      id: "p1",
      participant_id: GAMER,
      status: "active",
      state: "active",
      signed_up_at: "2026-08-02T10:00:00+00:00",
      waitlisted_at: null,
      seat_offer_sent_at: null,
      product: CLUB,
    },
    {
      id: "p2",
      participant_id: GAMER,
      status: "completed",
      state: "past",
      signed_up_at: "2026-05-02T10:00:00+00:00",
      waitlisted_at: null,
      seat_offer_sent_at: null,
      product: CAMP,
    },
    {
      id: "p3",
      participant_id: GAMER,
      status: "waitlisted",
      state: "waitlisted",
      signed_up_at: "2026-09-02T10:00:00+00:00",
      waitlisted_at: "2026-09-02T10:00:00+00:00",
      seat_offer_sent_at: null,
      product: { ...CAMP, id: "2f6a9d3e-8c14-4b70-a5e1-6d0b3c8f7a29", names: [{ locale: "en", name: "Fortnite Event" }], topic: "fortnite", product_type: "event" },
    },
  ],
  subscriptions: [
    {
      id: "s1",
      status: "active",
      current_period_end: "2026-11-02T10:00:00+00:00",
      currency: "eur",
      participation_id: "p1",
      created_at: "2026-08-02T10:00:00+00:00",
    },
  ],
  payments: {
    count: 3,
    first_at: "2026-05-02T10:00:00+00:00",
    last_at: "2026-10-02T10:00:00+00:00",
    lifetime_cents: { eur: 15_900 },
  },
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

afterEach(() => vi.unstubAllEnvs());

describe("the profile", () => {
  it("names every property and its value type", () => {
    expect(shapes(klaviyoProfileFor(FULL).properties)).toMatchInlineSnapshot(`
      {
        "Sogverse Account": "boolean",
        "Sogverse Account Created": "string",
        "Sogverse Active Product Types": "array<string>",
        "Sogverse Active Products": "array<string>",
        "Sogverse Country": "string",
        "Sogverse Currency": "string",
        "Sogverse Email Verified": "string",
        "Sogverse Environment": "string",
        "Sogverse First Payment": "string",
        "Sogverse Gamer Birth Years": "array<number>",
        "Sogverse Gamer Count": "number",
        "Sogverse Gamer Genders": "array<string>",
        "Sogverse Gamers": "array<{"First Name":"string","Birth Year":"number","Birth Month":"number","Gender":"string","Minecraft":"boolean","Roblox":"boolean"}>",
        "Sogverse Games": "array<string>",
        "Sogverse Home Location": "string",
        "Sogverse Home Location Id": "string",
        "Sogverse Last Payment": "string",
        "Sogverse Lifetime Spend EUR": "number",
        "Sogverse Linked Game Accounts": "array<string>",
        "Sogverse Past Products": "array<string>",
        "Sogverse Payment Count": "number",
        "Sogverse Registration Marketing Answer": "boolean",
        "Sogverse Signup Intent": "string",
        "Sogverse Signup Intent Id": "string",
        "Sogverse Signup UTM Campaign": "string",
        "Sogverse Signup UTM Content": "string",
        "Sogverse Signup UTM Medium": "string",
        "Sogverse Signup UTM Source": "string",
        "Sogverse Signup UTM Term": "string",
        "Sogverse Spoken Languages": "array<string>",
        "Sogverse Subscription Renews": "string",
        "Sogverse Subscription Status": "string",
        "Sogverse Waitlisted Products": "array<string>",
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

  it("says what it holds in the parent's locale, as dates and lists", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const { properties } = klaviyoProfileFor(FULL);
    expect(properties).toMatchObject({
      "Sogverse Account": true,
      "Sogverse Environment": "production",
      "Sogverse Active Products": ["Minecraft-kerho Espoo"],
      "Sogverse Past Products": ["Roblox Summer Camp"],
      "Sogverse Games": ["fortnite", "minecraft_java", "roblox_studio"],
      "Sogverse Waitlisted Products": ["Fortnite Event"],
      "Sogverse Subscription Status": "active",
      "Sogverse Subscription Renews": "2026-11-02T10:00:00+00:00",
      "Sogverse Lifetime Spend EUR": 159,
      "Sogverse Registration Marketing Answer": true,
    });
  });

  it("is staging everywhere off production", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(klaviyoProfileFor(FULL).properties["Sogverse Environment"]).toBe("staging");
  });

  it("sends the same names with nothing to say, clearing what Klaviyo held", () => {
    const empty: KlaviyoParentSnapshot = {
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
      payments: { count: 0, first_at: null, last_at: null, lifetime_cents: {} },
    };
    const profile = klaviyoProfileFor(empty);
    expect(Object.keys(profile.properties)).toEqual(
      Object.keys(klaviyoProfileFor(FULL).properties),
    );
    expect(profile.phoneNumber).toBeNull();
    expect(profile.country).toBeNull();
    expect(profile).not.toHaveProperty("locale");
    expect(profile.properties["Sogverse Subscription Status"]).toBeNull();
    expect(profile.properties["Sogverse Lifetime Spend EUR"]).toBe(0);
  });

  it("clears a stored number Klaviyo would refuse", () => {
    const profile = klaviyoProfileFor({ ...FULL, profile: { ...FULL.profile, phone: "0401234" } });
    expect(profile.phoneNumber).toBeNull();
  });
});

describe("the events", () => {
  const base = {
    event_id: "e1",
    customer_id: PARENT,
    occurred_at: "2026-10-01T09:00:00+00:00",
  };
  const rows: KlaviyoEventRow[] = [
    {
      ...base,
      kind: "account_created",
      unique_id: `account_created:${PARENT}`,
      properties: { source_id: PARENT, product: null },
    },
    {
      ...base,
      kind: "enrolled",
      unique_id: "enrolled:p1",
      properties: { source_id: "p1", product: CLUB, status: "active", participant_id: GAMER },
    },
    {
      ...base,
      kind: "waitlisted",
      unique_id: "waitlisted:p1",
      properties: { source_id: "p1", product: CLUB, status: "waitlisted", participant_id: GAMER },
    },
    {
      ...base,
      kind: "seat_offered",
      unique_id: "seat_offered:p1",
      properties: { source_id: "p1", product: CLUB, status: "waitlisted", participant_id: PARENT },
    },
    {
      ...base,
      kind: "payment",
      unique_id: "payment:pay1",
      properties: {
        source_id: "pay1",
        product: CLUB,
        amount_cents: 5_300,
        currency: "eur",
        purpose: "subscription_invoice",
      },
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
        currency: "eur",
      },
    },
  ];

  it("names every metric", () => {
    expect(EVENT_METRICS).toMatchInlineSnapshot(`
      {
        "account_created": "Sogverse Account Created",
        "enrolled": "Sogverse Enrolled",
        "payment": "Sogverse Payment",
        "seat_offered": "Sogverse Seat Offered",
        "subscription_cancelled": "Sogverse Subscription Cancelled",
        "waitlisted": "Sogverse Waitlisted",
      }
    `);
  });

  it("names every event's properties and their value types", () => {
    expect(
      Object.fromEntries(
        rows.map((row) => {
          const event = klaviyoEventFor(row, FULL);
          return [event.metric, { ...shapes(event.properties), value: shapeOf(event.value ?? null) }];
        }),
      ),
    ).toMatchInlineSnapshot(`
      {
        "Sogverse Account Created": {
          "value": "null",
        },
        "Sogverse Enrolled": {
          "End Date": "string",
          "Gamer First Name": "string",
          "Product": "string",
          "Product Id": "string",
          "Product Type": "string",
          "Start Date": "string",
          "Status": "string",
          "Topic": "string",
          "value": "null",
        },
        "Sogverse Payment": {
          "Amount": "number",
          "Currency": "string",
          "End Date": "string",
          "Product": "string",
          "Product Id": "string",
          "Product Type": "string",
          "Purpose": "string",
          "Start Date": "string",
          "Topic": "string",
          "value": "object",
        },
        "Sogverse Seat Offered": {
          "End Date": "string",
          "Gamer First Name": "null",
          "Product": "string",
          "Product Id": "string",
          "Product Type": "string",
          "Start Date": "string",
          "Status": "string",
          "Topic": "string",
          "value": "null",
        },
        "Sogverse Subscription Cancelled": {
          "Currency": "string",
          "End Date": "string",
          "Ends": "string",
          "Product": "string",
          "Product Id": "string",
          "Product Type": "string",
          "Start Date": "string",
          "Status": "string",
          "Topic": "string",
          "value": "null",
        },
        "Sogverse Waitlisted": {
          "End Date": "string",
          "Gamer First Name": "string",
          "Product": "string",
          "Product Id": "string",
          "Product Type": "string",
          "Start Date": "string",
          "Status": "string",
          "Topic": "string",
          "value": "null",
        },
      }
    `);
  });

  it("keeps the row's unique id and time, names the gamer and values a payment", () => {
    const [, enrolled, , offered, payment] = rows.map((row) => klaviyoEventFor(row, FULL));
    expect(enrolled).toMatchObject({
      uniqueId: "enrolled:p1",
      time: "2026-10-01T09:00:00+00:00",
      properties: { Product: "Minecraft-kerho Espoo", "Gamer First Name": "Eetu" },
    });
    expect(offered.properties["Gamer First Name"]).toBeNull();
    expect(payment.value).toEqual({ amount: 53, currency: "EUR" });
  });

  it("subscribes only an account created with the box ticked", () => {
    const [created, enrolled] = rows;
    const answered = (answer: boolean | null): KlaviyoParentSnapshot => ({
      ...FULL,
      attribution: { ...FULL.attribution, registration_marketing_consent: answer },
    });
    expect(subscribesOnSend(created, answered(true))).toBe(true);
    expect(subscribesOnSend(created, answered(false))).toBe(false);
    expect(subscribesOnSend(created, answered(null))).toBe(false);
    expect(subscribesOnSend(enrolled, answered(true))).toBe(false);
  });
});

describe("the newsletter", () => {
  it("names the page and the visit's UTM values apart from the account's", () => {
    expect(
      newsletterProperties("page-id", { utm_source: "meta", utm_term: "roblox" }),
    ).toMatchInlineSnapshot(`
      {
        "Sogverse Newsletter Page": "page-id",
        "Sogverse Newsletter UTM Source": "meta",
        "Sogverse Newsletter UTM Term": "roblox",
      }
    `);
  });
});
