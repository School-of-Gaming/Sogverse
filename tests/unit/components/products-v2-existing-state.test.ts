import { describe, it, expect } from "vitest";
import {
  buildUpdateInput,
  existingFormState,
} from "@/components/admin/products-v2/product-v2-build";
import { PRODUCT_TYPE_CONFIG } from "@/components/admin/products-v2/product-v2-type-config";
import type { ProductV2AdminDetailRow } from "@/services/products-v2";

// Verifies the `existingFormState` reverse transform: a fetched product
// row is mapped back into FormState such that round-tripping it through
// buildUpdateInput re-emits the same values. Catches regressions in
// startMode inference, currency cents↔decimal conversion, manualEdits
// seeding, and the registration-mode (immediate vs scheduled) branch.

const consumerConfig = PRODUCT_TYPE_CONFIG.consumer_club;

/** Synthetic admin-detail row covering every field the form touches. */
function syntheticConsumerProduct(): ProductV2AdminDetailRow {
  return {
    id: "00000000-0000-0000-0000-0000000005a1",
    product_type: "consumer_club",
    billing_mode: "paid",
    topic_id: "topic-1",
    min_age: 7,
    max_age: 12,
    spoken_language_code: "en",
    image_path: "abc.png",
    padlet_url: null,
    location_id: null,
    is_remote: true,
    status: "pending",
    signup_threshold: null,
    start_date: "2026-09-01",
    end_date: null,
    timezone: "Europe/Helsinki",
    seat_count: 10,
    waitlist_enabled: true,
    // Already past — reverse transform should pick `immediately`.
    registration_opens_at: new Date(Date.now() - 60_000).toISOString(),
    refund_policy_days: null,
    is_visible: true,
    created_by: "admin-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    topics_v2: {
      id: "topic-1",
      slug: "minecraft",
      kind: "game",
      topic_translations_v2: [{ locale: "en", name: "Minecraft" }],
    },
    product_translations_v2: [
      {
        product_id: "00000000-0000-0000-0000-0000000005a1",
        locale: "en",
        name: "Build Club",
        description: "Build castles together.",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    product_tags_v2: [
      {
        tag_id: "tag-1",
        tags_v2: {
          slug: "creative",
          tag_translations_v2: [{ locale: "en", name: "Creative" }],
        },
      },
    ],
    product_prices_v2: [
      { currency: "eur", price_per_session: 1500, price_per_month: 4500 },
      { currency: "gbp", price_per_session: 1300, price_per_month: 3900 },
      { currency: "usd", price_per_session: 1700, price_per_month: 5100 },
    ],
    schedule_slots_v2: [
      { weekday: 1, start_time: "16:00", duration_minutes: 90 },
    ],
    locations: null,
    product_holiday_calendars_v2: [
      { calendar_id: "cal-1", holiday_calendars_v2: { name: "Finland" } },
    ],
  };
}

describe("existingFormState", () => {
  it("seeds field values from the product row", () => {
    const product = syntheticConsumerProduct();
    const state = existingFormState(product, consumerConfig, "en");

    expect(state.translations).toEqual({
      en: { name: "Build Club", description: "Build castles together." },
    });
    expect(state.activeLocale).toBe("en");
    expect(state.topicId).toBe("topic-1");
    expect(state.tagIds).toEqual(new Set(["tag-1"]));
    expect(state.minAge).toBe("7");
    expect(state.maxAge).toBe("12");
    expect(state.startDate).toBe("2026-09-01");
    expect(state.endDate).toBe("");
    expect(state.startMode).toBe("date"); // start_date set, no threshold
    expect(state.signupThreshold).toBe("");
    expect(state.holidayCalendarIds).toEqual(new Set(["cal-1"]));
    expect(state.image).toBe("abc.png");
  });

  it("converts prices cents → decimal strings", () => {
    const product = syntheticConsumerProduct();
    const state = existingFormState(product, consumerConfig, "en");

    expect(state.prices.eur.session).toBe("15.00");
    expect(state.prices.eur.month).toBe("45.00");
    expect(state.prices.gbp.session).toBe("13.00");
    expect(state.prices.usd.month).toBe("51.00");
  });

  it("seeds manualEdits with all currencies so editing EUR doesn't FX-overwrite GBP/USD", () => {
    const product = syntheticConsumerProduct();
    const state = existingFormState(product, consumerConfig, "en");

    expect(state.manualEdits).toEqual(new Set(["eur", "gbp", "usd"]));
  });

  it("derives registrationOpensMode = 'immediately' for a past timestamp", () => {
    const product = syntheticConsumerProduct(); // already in the past
    const state = existingFormState(product, consumerConfig, "en");

    expect(state.registrationOpensMode).toBe("immediately");
    expect(state.registrationOpensDate).toBe("");
  });

  it("derives registrationOpensMode = 'scheduled' for a future timestamp and populates date/hour/minute", () => {
    const product = syntheticConsumerProduct();
    // 2030-06-15 14:30 Helsinki time → fixed UTC.
    product.registration_opens_at = "2030-06-15T11:30:00.000Z";
    const state = existingFormState(product, consumerConfig, "en");

    expect(state.registrationOpensMode).toBe("scheduled");
    expect(state.registrationOpensDate).toBe("2030-06-15");
    expect(state.registrationOpensHour).toBe("14");
    expect(state.registrationOpensMinute).toBe("30");
  });

  it("infers startMode = 'date_and_threshold' when both are set", () => {
    const product = syntheticConsumerProduct();
    product.start_date = "2026-09-01";
    product.signup_threshold = 5;
    const state = existingFormState(product, consumerConfig, "en");

    expect(state.startMode).toBe("date_and_threshold");
    expect(state.signupThreshold).toBe("5");
  });

  it("infers startMode = 'threshold' when only threshold is set", () => {
    const product = syntheticConsumerProduct();
    product.start_date = null;
    product.signup_threshold = 5;
    const state = existingFormState(product, consumerConfig, "en");

    expect(state.startMode).toBe("threshold");
  });

  it("falls back to en when uiLocale has no translation but en does", () => {
    // Mirrors resolveTranslation's chain: uiLocale → en → first available.
    const product = syntheticConsumerProduct();
    product.product_translations_v2 = [
      {
        product_id: product.id,
        locale: "en",
        name: "Build Club",
        description: "Build castles together.",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        product_id: product.id,
        locale: "sv",
        name: "Byggklubb",
        description: "Bygg slott tillsammans.",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    const state = existingFormState(product, consumerConfig, "fi");

    expect(state.activeLocale).toBe("en");
  });

  it("falls back to first-available locale when neither uiLocale nor en exist", () => {
    const product = syntheticConsumerProduct();
    product.product_translations_v2 = [
      {
        product_id: product.id,
        locale: "fi",
        name: "Rakentajien kerho",
        description: "Rakennetaan yhdessä.",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    const state = existingFormState(product, consumerConfig, "sv");

    expect(state.activeLocale).toBe("fi");
  });
});

describe("buildUpdateInput round-trip", () => {
  it("re-emits the same field values that existingFormState seeded", () => {
    const product = syntheticConsumerProduct();
    const state = existingFormState(product, consumerConfig, "en");
    const input = buildUpdateInput(state, consumerConfig);

    expect(input.billing_mode).toBe("paid");
    expect(input.topic_id).toBe("topic-1");
    expect(input.min_age).toBe(7);
    expect(input.max_age).toBe(12);
    expect(input.start_date).toBe("2026-09-01");
    expect(input.end_date).toBe(null);
    expect(input.signup_threshold).toBe(null);
    expect(input.tag_ids).toEqual(["tag-1"]);
    expect(input.holiday_calendar_ids).toEqual(["cal-1"]);
    expect(input.image).toBe("abc.png");
    expect(input.prices).toEqual([
      { currency: "eur", price_per_session: 1500, price_per_month: 4500 },
      { currency: "gbp", price_per_session: 1300, price_per_month: 3900 },
      { currency: "usd", price_per_session: 1700, price_per_month: 5100 },
    ]);
    expect(input.translations).toEqual([
      { locale: "en", name: "Build Club", description: "Build castles together." },
    ]);
  });
});
