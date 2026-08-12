import { describe, it, expect } from "vitest";
import {
  buildUpdateInput,
  existingFormState,
} from "@/components/admin/products/product-build";
import { PRODUCT_TYPE_CONFIG } from "@/components/admin/products/product-type-config";
import type { ProductAdminDetailRow } from "@/services/products";

// Verifies the `existingFormState` reverse transform: a fetched product
// row is mapped back into FormState such that round-tripping it through
// buildUpdateInput re-emits the same values. Catches regressions in
// startMode inference, currency cents↔decimal conversion, and the
// registration-mode (immediate vs scheduled) branch.

const consumerConfig = PRODUCT_TYPE_CONFIG.consumer_club;

/** Synthetic admin-detail row covering every field the form touches. */
function syntheticConsumerProduct(): ProductAdminDetailRow {
  return {
    id: "00000000-0000-0000-0000-0000000005a1",
    product_type: "consumer_club",
    billing_mode: "paid",
    topic: "minecraft_java",
    for_gamers: true,
    for_parents: false,
    min_age: 7,
    max_age: 12,
    tag: null,
    spoken_language_code: "en",
    image_path: "abc.png",
    // Staff-only, so it arrives on its own embedded row rather than as a column
    // on the product. `null` is the ordinary case: no row means no lesson link.
    product_staff_details: null,
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
    primary_gedu_fee_cents: null,
    assistant_gedu_fee_cents: null,
    municipality_fee_cents: null,
    is_visible: true,
    created_by: "admin-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    product_translations: [
      {
        product_id: "00000000-0000-0000-0000-0000000005a1",
        locale: "en",
        name: "Build Club",
        short_description: "Build castles together.",
        long_description: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    product_prices: [
      { currency: "eur", price_cents: 4500 },
      { currency: "gbp", price_cents: 3900 },
      { currency: "usd", price_cents: 5100 },
    ],
    schedule_slots: [
      { weekday: 1, start_time: "16:00", duration_minutes: 90 },
    ],
    locations: null,
    product_holiday_calendars: [
      { calendar_id: "cal-1", holiday_calendars: { name: "Finland" } },
    ],
  };
}

describe("existingFormState", () => {
  it("seeds field values from the product row", () => {
    const product = syntheticConsumerProduct();
    const state = existingFormState(product, consumerConfig, "en");

    expect(state.translations).toEqual({
      en: {
        name: "Build Club",
        shortDescription: "Build castles together.",
        longDescription: [],
      },
    });
    expect(state.activeLocale).toBe("en");
    expect(state.topic).toBe("minecraft_java");
    expect(state.minAge).toBe("7");
    expect(state.maxAge).toBe("12");
    expect(state.startDate).toBe("2026-09-01");
    expect(state.endDate).toBe("");
    expect(state.startMode).toBe("date"); // start_date set, no threshold
    expect(state.signupThreshold).toBe("");
    expect(state.holidayCalendarIds).toEqual(new Set(["cal-1"]));
    expect(state.image).toBe("abc.png");
    expect(state.forGamers).toBe(true);
    expect(state.forParents).toBe(false);
  });

  // A parents-only row carries no age range at all — never a sentinel adult
  // one — so it has to load as the empty fields it is. `String(null)` would
  // seed the literal "null", which the payload builder parses back as NaN.
  it("loads a parents-only product's null ages as empty fields", () => {
    const product = syntheticConsumerProduct();
    product.for_gamers = false;
    product.for_parents = true;
    product.min_age = null;
    product.max_age = null;
    const state = existingFormState(product, consumerConfig, "en");

    expect(state.forGamers).toBe(false);
    expect(state.forParents).toBe(true);
    expect(state.minAge).toBe("");
    expect(state.maxAge).toBe("");
  });

  it("loads price_cents into the month slot for a monthly product", () => {
    const product = syntheticConsumerProduct();
    const state = existingFormState(product, consumerConfig, "en");

    // Consumer clubs are monthly, so price_cents loads into `month`; the
    // unused `session` slot stays blank. Legacy non-EUR rows on the product
    // (gbp/usd) are ignored under the EUR-only lockdown.
    expect(state.prices.eur).toEqual({ session: "", month: "45.00" });
    expect(Object.keys(state.prices)).toEqual(["eur"]);
  });

  it("derives registrationOpensMode = 'immediately' for a past timestamp", () => {
    const product = syntheticConsumerProduct(); // already in the past
    const state = existingFormState(product, consumerConfig, "en");

    expect(state.registrationOpensMode).toBe("immediately");
    expect(state.registrationOpensDate).toBe("");
  });

  it("forces registrationOpensMode = 'immediately' on a locked type even for a future timestamp", () => {
    // Consumer clubs keep the global registration-window lock, so the stored
    // row does not get a vote here: deriving "scheduled" would open the form
    // pinned to a disabled radio, with only the date fields live. The future
    // drop is left unread and normalised away by the next save. The scheduled
    // branch itself is exercised in products-build.test.ts against a
    // municipality club, the one type where the chooser is editable.
    const product = syntheticConsumerProduct();
    // 2030-06-15 14:30 Helsinki time → fixed UTC.
    product.registration_opens_at = "2030-06-15T11:30:00.000Z";
    const state = existingFormState(product, consumerConfig, "en");

    expect(state.registrationOpensMode).toBe("immediately");
    expect(state.registrationOpensDate).toBe("");
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
    product.product_translations = [
      {
        product_id: product.id,
        locale: "en",
        name: "Build Club",
        short_description: "Build castles together.",
        long_description: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        product_id: product.id,
        locale: "sv",
        name: "Byggklubb",
        short_description: "Bygg slott tillsammans.",
        long_description: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    const state = existingFormState(product, consumerConfig, "fi");

    expect(state.activeLocale).toBe("en");
  });

  it("falls back to first-available locale when neither uiLocale nor en exist", () => {
    const product = syntheticConsumerProduct();
    product.product_translations = [
      {
        product_id: product.id,
        locale: "fi",
        name: "Rakentajien kerho",
        short_description: "Rakennetaan yhdessä.",
        long_description: null,
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
    expect(input.topic).toBe("minecraft_java");
    expect(input.min_age).toBe(7);
    expect(input.max_age).toBe(12);
    expect(input.start_date).toBe("2026-09-01");
    expect(input.end_date).toBe(null);
    expect(input.signup_threshold).toBe(null);
    expect(input.holiday_calendar_ids).toEqual(["cal-1"]);
    expect(input.image).toBe("abc.png");
    // Consumer clubs charge a monthly subscription; the single price_cents
    // round-trips from the persisted row's monthly amount. EUR-only, so the
    // payload carries a single eur row even though the source had legacy
    // gbp/usd rows.
    expect(input.prices).toEqual([
      { currency: "eur", price_cents: 4500 },
    ]);
    expect(input.translations).toEqual([
      {
        locale: "en",
        name: "Build Club",
        short_description: "Build castles together.",
        long_description: null,
      },
    ]);
  });

  // The nulling trap, closed from the form's end: `update_product` assigns every
  // editable column on every call, so a product's audience and ages survive an
  // edit about something else only by being loaded into state and sent back out.
  it("re-emits a gamers-only product's audience through an unrelated edit", () => {
    const product = syntheticConsumerProduct();
    const state = existingFormState(product, consumerConfig, "en");
    state.translations = {
      en: {
        name: "Build Club Renamed",
        shortDescription: "Build castles together.",
        longDescription: [],
      },
    };
    const input = buildUpdateInput(state, consumerConfig);

    expect(input.for_gamers).toBe(true);
    expect(input.for_parents).toBe(false);
    expect(input.min_age).toBe(7);
    expect(input.max_age).toBe(12);
  });

  it("round-trips a parents-only product's audience and null ages", () => {
    const product = syntheticConsumerProduct();
    product.for_gamers = false;
    product.for_parents = true;
    product.min_age = null;
    product.max_age = null;
    const state = existingFormState(product, consumerConfig, "en");
    const input = buildUpdateInput(state, consumerConfig);

    expect(input.for_gamers).toBe(false);
    expect(input.for_parents).toBe(true);
    // Null, not `Number("")`'s zero: the age CHECK refuses a range on a product
    // with no gamer audience, and 0 is a range.
    expect(input.min_age).toBeNull();
    expect(input.max_age).toBeNull();
  });

  it("round-trips a both-audience product's flags with its range intact", () => {
    const product = syntheticConsumerProduct();
    product.for_parents = true; // for_gamers stays true
    const state = existingFormState(product, consumerConfig, "en");
    const input = buildUpdateInput(state, consumerConfig);

    expect(input.for_gamers).toBe(true);
    expect(input.for_parents).toBe(true);
    expect(input.min_age).toBe(7);
    expect(input.max_age).toBe(12);
  });
});
