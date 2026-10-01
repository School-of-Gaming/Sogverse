import { afterAll, describe, expect, it, vi } from "vitest";
import {
  productJsonLd,
  type ProductJsonLdSubject,
} from "@/lib/products/product-json-ld";

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
afterAll(() => vi.unstubAllEnvs());

const SITE = "https://test.sogverse.local";
const PATH = "/en/shop/3f8a2c1e-6b4d-4e9a-8c7f-2d1e0b9a8c76";
const STAMP = "2026-08-01T00:00:00.000Z";
const PRODUCT_ID = "3f8a2c1e-6b4d-4e9a-8c7f-2d1e0b9a8c76";

/** A weekly online club, paid monthly — every column a fully-typed default. */
function product(overrides: Partial<ProductJsonLdSubject> = {}): ProductJsonLdSubject {
  return {
    product_type: "consumer_club",
    billing_mode: "paid",
    product_translations: [
      {
        product_id: PRODUCT_ID,
        locale: "en",
        name: "Minecraft club",
        short_description: "Build together every week.",
        long_description: null,
        created_at: STAMP,
        updated_at: STAMP,
      },
    ],
    product_prices: [
      {
        product_id: PRODUCT_ID,
        currency: "eur",
        price_cents: 4900,
        created_at: STAMP,
        updated_at: STAMP,
      },
    ],
    schedule_slots: [{ weekday: 2, start_time: "17:00:00", duration_minutes: 60 }],
    locations: null,
    is_remote: true,
    for_gamers: true,
    min_age: 8,
    max_age: 12,
    start_date: "2026-09-01",
    end_date: "2026-12-15",
    timezone: "Europe/Helsinki",
    image_path: "products/minecraft.jpg",
    spoken_language_code: "fi",
    ...overrides,
  };
}

const SITE_ROW = {
  id: "9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f",
  name: "Tapiolan koulu",
  name_i18n: null,
  type: "site" as const,
  parent: {
    id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    name: "Espoo",
    name_i18n: { sv: "Esbo" },
    type: "municipality" as const,
  },
};

function build(subject: ProductJsonLdSubject) {
  return productJsonLd({ siteUrl: SITE, canonicalPath: PATH, product: subject, locale: "en" });
}

describe("productJsonLd", () => {
  it("states a club as a Course with a weekly course instance", () => {
    expect(build(product())).toEqual({
      "@context": "https://schema.org",
      "@type": "Course",
      name: "Minecraft club",
      description: "Build together every week.",
      url: `${SITE}${PATH}`,
      image:
        "http://127.0.0.1:54321/storage/v1/object/public/product-images/products/minecraft.jpg",
      inLanguage: "fi",
      audience: { "@type": "PeopleAudience", suggestedMinAge: 8, suggestedMaxAge: 12 },
      offers: {
        "@type": "Offer",
        url: `${SITE}${PATH}`,
        price: "49.00",
        priceCurrency: "EUR",
        category: "Subscription",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: "49.00",
          priceCurrency: "EUR",
          billingDuration: "P1M",
        },
      },
      provider: {
        "@type": "Organization",
        "@id": `${SITE}/#organization`,
        name: "School of Gaming",
      },
      hasCourseInstance: {
        "@type": "CourseInstance",
        courseMode: "Online",
        courseSchedule: [
          {
            "@type": "Schedule",
            repeatFrequency: "P1W",
            byDay: "https://schema.org/Wednesday",
            startTime: "17:00:00",
            duration: "PT60M",
            startDate: "2026-09-01",
            endDate: "2026-12-15",
            scheduleTimezone: "Europe/Helsinki",
          },
        ],
      },
    });
  });

  it("names an onsite club's place as the page does", () => {
    const course = build(product({ is_remote: false, locations: SITE_ROW }));

    expect(course).toMatchObject({
      hasCourseInstance: {
        courseMode: "Onsite",
        location: {
          "@type": "Place",
          name: "Tapiolan koulu",
          address: { "@type": "PostalAddress", addressLocality: "Espoo" },
        },
      },
    });
  });

  it("states a camp as a dated Event at its place, organised by School of Gaming", () => {
    const camp = build(
      product({
        product_type: "camp",
        is_remote: false,
        locations: SITE_ROW,
        start_date: "2027-06-07",
        end_date: "2027-06-11",
      }),
    );

    expect(camp).toMatchObject({
      "@type": "Event",
      startDate: "2027-06-07",
      endDate: "2027-06-11",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: { "@type": "Place", name: "Tapiolan koulu" },
      organizer: { "@id": `${SITE}/#organization` },
      offers: { price: "49.00", priceCurrency: "EUR", category: "Paid" },
    });
    expect(camp).not.toHaveProperty("hasCourseInstance");
  });

  it("puts an online event at its page", () => {
    expect(build(product({ product_type: "event", end_date: null }))).toMatchObject({
      "@type": "Event",
      eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
      location: { "@type": "VirtualLocation", url: `${SITE}${PATH}` },
    });
  });

  it("states a free product as a free offer", () => {
    expect(build(product({ billing_mode: "free" }))).toMatchObject({
      offers: { "@type": "Offer", price: "0", priceCurrency: "EUR", category: "Free" },
    });
  });

  it("states no price the page does not show, no ages it does not show and no picture it does not have", () => {
    const course = build(
      product({ product_prices: [], min_age: null, max_age: null, image_path: null }),
    );

    expect(course).not.toHaveProperty("offers");
    expect(course).not.toHaveProperty("audience");
    expect(course).not.toHaveProperty("image");
  });

  it("states no availability or seats — they are live", () => {
    const json = JSON.stringify(build(product()));

    expect(json).not.toContain("availability");
    expect(json).not.toContain("seat");
  });
});
