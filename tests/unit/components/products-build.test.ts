import { describe, it, expect } from "vitest";
import {
  buildCreateInput,
  cloneFormState,
  validate,
} from "@/components/admin/products/product-build";
import {
  initialState,
  type FormState,
} from "@/components/admin/products/product-form-state";
import { PRODUCT_TYPE_CONFIG } from "@/components/admin/products/product-type-config";
import type { ProductAdminDetailRow } from "@/services/products";

// Validation + payload-building moved out of ProductForm so it can be
// tested without rendering. These tests cover the *complex, easily-broken*
// rules: per-product-type branching, weekday math (JS Sun-first vs schema
// Mon-first), end-date derivation for events, prices→cents conversion,
// scheduled-registration ISO assembly, and the visibility/status pairing.

const consumerConfig = PRODUCT_TYPE_CONFIG.consumer_club;
const eventConfig = PRODUCT_TYPE_CONFIG.event;
const muniConfig = PRODUCT_TYPE_CONFIG.municipality_club;
const campConfig = PRODUCT_TYPE_CONFIG.camp;

/** A consumer-club state that passes every rule. Tests start from here
 *  and break exactly one rule at a time. */
function validConsumerState(): FormState {
  const s = initialState(consumerConfig, "en");
  s.translations = {
    en: { name: "Test Club", description: "A great club" },
  };
  s.activeLocale = "en";
  s.topic = "minecraft";
  s.spokenLanguageCode = "en";
  s.isRemote = true;
  s.locationId = null;
  s.startMode = "date";
  s.startDate = "2026-09-01";
  s.endDate = "";
  s.scheduleSlots = [{ weekday: 1, start_time: "16:00", duration_minutes: 90 }];
  s.paidMode = "paid";
  s.prices = {
    eur: { session: "10.00", month: "30.00" },
    gbp: { session: "8.50", month: "26.00" },
    usd: { session: "11.00", month: "33.00" },
  };
  s.seatCount = "10";
  return s;
}

describe("validate", () => {
  describe("translations", () => {
    it("requires at least one filled locale", () => {
      const s = validConsumerState();
      s.translations = { en: { name: "", description: "" } };
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "translationRequired",
      });
    });

    it("accepts a single non-en/non-fi locale (sv only)", () => {
      // Rule: any single locale is enough. Display falls back through
      // user-locale → en → first available, so a Swedish-only product
      // still resolves for any viewer.
      const s = validConsumerState();
      s.translations = {
        sv: { name: "Klubb", description: "En klubb" },
      };
      expect(validate(s, consumerConfig)).toBeNull();
    });

    it("rejects a half-filled locale tab", () => {
      const s = validConsumerState();
      s.translations = {
        en: { name: "Test Club", description: "A great club" },
        sv: { name: "Klubb", description: "" },
      };
      const result = validate(s, consumerConfig);
      expect(result).toEqual({
        messageKey: "translationIncomplete",
        values: { locale: "Swedish" },
      });
    });

    it("accepts whitespace-only as empty (trims for emptiness check)", () => {
      const s = validConsumerState();
      s.translations = {
        en: { name: "   ", description: "   " },
      };
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "translationRequired",
      });
    });
  });

  describe("identity", () => {
    it("requires a topic", () => {
      const s = validConsumerState();
      s.topic = "";
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "topicRequired",
      });
    });

    it("requires spoken language", () => {
      const s = validConsumerState();
      s.spokenLanguageCode = "";
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "spokenLanguageRequired",
      });
    });

    it("rejects an invalid padlet URL", () => {
      const s = validConsumerState();
      s.padletUrl = "not-a-url";
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "padletInvalid",
      });
    });

    it("accepts a blank padlet URL (optional field)", () => {
      const s = validConsumerState();
      s.padletUrl = "";
      expect(validate(s, consumerConfig)).toBeNull();
    });
  });

  describe("audience", () => {
    it("rejects a non-integer min age", () => {
      const s = validConsumerState();
      s.minAge = "5.5";
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "minAgeInvalid",
      });
    });

    it("rejects max age below min", () => {
      const s = validConsumerState();
      s.minAge = "10";
      s.maxAge = "5";
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "maxAgeInvalid",
      });
    });
  });

  describe("location", () => {
    it("requires a site for in-person consumer clubs", () => {
      const s = validConsumerState();
      s.isRemote = false;
      s.locationId = null;
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "siteRequired",
      });
    });

    it("requires a municipality for online municipality clubs", () => {
      const s = validConsumerState();
      s.isRemote = true;
      s.locationId = null;
      expect(validate(s, muniConfig)).toEqual({
        messageKey: "municipalityRequired",
      });
    });

    it("does not require a location for online consumer clubs", () => {
      const s = validConsumerState();
      s.isRemote = true;
      s.locationId = null;
      expect(validate(s, consumerConfig)).toBeNull();
    });
  });

  describe("when", () => {
    it("requires startDate when startMode uses a date", () => {
      const s = validConsumerState();
      s.startMode = "date";
      s.startDate = "";
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "startDateRequired",
      });
    });

    it("does not require startDate for threshold-only mode", () => {
      const s = validConsumerState();
      s.startMode = "threshold";
      s.startDate = "";
      s.signupThreshold = "5";
      expect(validate(s, consumerConfig)).toBeNull();
    });

    it("requires endDate for camps and municipality clubs", () => {
      const s = validConsumerState();
      s.startMode = "date";
      s.startDate = "2026-09-01";
      s.endDate = "";
      // Camp uses multi_day_bounded — endDate is required.
      const campState = { ...s, scheduleSlots: s.scheduleSlots.slice(0, 1) };
      expect(validate(campState, campConfig)).toEqual({
        messageKey: "endDateRequired",
      });
      // Muni clubs always require a municipality, even online — give it one
      // so we get past the location check and reach the endDate check.
      const muniState = { ...s, locationId: "muni-id" };
      expect(validate(muniState, muniConfig)).toEqual({
        messageKey: "endDateRequired",
      });
    });

    it("does NOT require endDate for consumer clubs (weekly_ongoing)", () => {
      const s = validConsumerState();
      s.endDate = "";
      expect(validate(s, consumerConfig)).toBeNull();
    });

    it("does NOT require endDate for events (single_date)", () => {
      const s = validConsumerState();
      s.endDate = "";
      s.startDate = "2026-09-01";
      s.startMode = "date";
      s.paidMode = "free";
      s.seatCount = "30";
      // Event needs a single slot.
      s.scheduleSlots = [
        { weekday: 0, start_time: "18:00", duration_minutes: 90 },
      ];
      expect(validate(s, eventConfig)).toBeNull();
    });

    it("rejects threshold < 1", () => {
      const s = validConsumerState();
      s.startMode = "threshold";
      s.startDate = "";
      s.signupThreshold = "0";
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "thresholdInvalid",
      });
    });

    it("requires at least one schedule slot", () => {
      const s = validConsumerState();
      s.scheduleSlots = [];
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "scheduleRequired",
      });
    });
  });

  describe("billing & seats", () => {
    it("rejects seat count of 0", () => {
      const s = validConsumerState();
      s.seatCount = "0";
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "seatCountInvalid",
      });
    });

    it("does NOT require seat count when free event is uncapped", () => {
      const s = validConsumerState();
      s.paidMode = "free";
      s.uncapped = true;
      s.seatCount = "";
      s.startDate = "2026-09-01";
      s.scheduleSlots = [
        { weekday: 0, start_time: "18:00", duration_minutes: 90 },
      ];
      expect(validate(s, eventConfig)).toBeNull();
    });

    it("rejects missing monthly price for paid consumer clubs and reports the offending currency", () => {
      const s = validConsumerState();
      s.prices.gbp = { session: "8.50", month: "" };
      const result = validate(s, consumerConfig);
      expect(result).toEqual({
        messageKey: "priceMonthMissing",
        values: { currency: "GBP" },
        focusCurrency: "gbp",
      });
    });

    it("rejects negative price", () => {
      const s = validConsumerState();
      s.prices.eur = { session: "10.00", month: "-30.00" };
      const result = validate(s, consumerConfig);
      expect(result?.messageKey).toBe("priceMonthNegative");
      expect(result?.focusCurrency).toBe("eur");
    });

    it("validates the monthly price for clubs and the session total for camps", () => {
      // Camp is upfront_total — month is irrelevant.
      const camp = validConsumerState();
      camp.scheduleSlots = [
        { weekday: 0, start_time: "10:00", duration_minutes: 180 },
        { weekday: 2, start_time: "10:00", duration_minutes: 180 },
        { weekday: 4, start_time: "10:00", duration_minutes: 180 },
      ];
      camp.startDate = "2026-09-01";
      camp.endDate = "2026-09-05";
      camp.prices = {
        eur: { session: "100", month: "" },
        gbp: { session: "85", month: "" },
        usd: { session: "110", month: "" },
      };
      expect(validate(camp, campConfig)).toBeNull();

      // Consumer club needs the month price too.
      const club = validConsumerState();
      club.prices.eur = { session: "10.00", month: "" };
      const result = validate(club, consumerConfig);
      expect(result?.messageKey).toBe("priceMonthMissing");
    });

    it("skips pricing block entirely for municipality clubs (external billing)", () => {
      const s = validConsumerState();
      s.startDate = "2026-09-01";
      s.endDate = "2026-12-15";
      s.locationId = "muni-id";
      s.prices = {
        eur: { session: "", month: "" },
        gbp: { session: "", month: "" },
        usd: { session: "", month: "" },
      };
      expect(validate(s, muniConfig)).toBeNull();
    });
  });

  describe("registration timing", () => {
    it("requires a date when registration mode is scheduled", () => {
      const s = validConsumerState();
      s.registrationOpensMode = "scheduled";
      s.registrationOpensDate = "";
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "registrationOpensDateRequired",
      });
    });

    it("does not require a date for immediate registration", () => {
      const s = validConsumerState();
      s.registrationOpensMode = "immediately";
      s.registrationOpensDate = "";
      expect(validate(s, consumerConfig)).toBeNull();
    });
  });

  it("returns null for a fully-valid consumer-club state (anchor)", () => {
    expect(validate(validConsumerState(), consumerConfig)).toBeNull();
  });
});

describe("buildCreateInput", () => {
  it("converts the monthly price to cents and zeros price_per_session for clubs", () => {
    // Consumer clubs charge a flat monthly subscription, so the monthly price
    // goes to price_per_month and price_per_session is forced to 0. The
    // session input is ignored. See decimalToCents in src/lib/utils.ts.
    const s = validConsumerState();
    s.prices.eur = { session: "10.005", month: "30.99" };
    const out = buildCreateInput(s, "consumer_club", consumerConfig);
    const eur = out.prices.find((p) => p.currency === "eur")!;
    expect(eur.price_per_session).toBe(0);
    expect(eur.price_per_month).toBe(3099);
  });

  it("zeros out price_per_month for upfront_total products (camp)", () => {
    const s = validConsumerState();
    s.scheduleSlots = [
      { weekday: 0, start_time: "10:00", duration_minutes: 180 },
    ];
    s.startDate = "2026-09-01";
    s.endDate = "2026-09-05";
    s.prices = {
      eur: { session: "100", month: "" },
      gbp: { session: "85", month: "" },
      usd: { session: "110", month: "" },
    };
    const out = buildCreateInput(s, "camp", campConfig);
    expect(out.prices.every((p) => p.price_per_month === 0)).toBe(true);
    expect(out.prices.find((p) => p.currency === "eur")!.price_per_session).toBe(
      10000,
    );
  });

  it("emits an empty prices array for external_contract billing (muni)", () => {
    const s = validConsumerState();
    s.startDate = "2026-09-01";
    s.endDate = "2026-12-15";
    s.locationId = "muni-id";
    const out = buildCreateInput(s, "municipality_club", muniConfig);
    expect(out.prices).toEqual([]);
    expect(out.billing_mode).toBe("external_contract");
  });

  it("emits empty prices for free events", () => {
    const s = validConsumerState();
    s.paidMode = "free";
    s.startDate = "2026-09-01";
    s.scheduleSlots = [
      { weekday: 0, start_time: "18:00", duration_minutes: 90 },
    ];
    const out = buildCreateInput(s, "event", eventConfig);
    expect(out.prices).toEqual([]);
    expect(out.billing_mode).toBe("free");
  });

  describe("event single-date special handling", () => {
    it("derives weekday from startDate using Mon-first (0=Mon..6=Sun)", () => {
      // 2026-09-06 is a Sunday → schema weekday should be 6.
      const s = validConsumerState();
      s.paidMode = "free";
      s.startDate = "2026-09-06";
      s.scheduleSlots = [
        { weekday: 0, start_time: "18:00", duration_minutes: 90 },
      ];
      const out = buildCreateInput(s, "event", eventConfig);
      expect(out.schedule_slots[0].weekday).toBe(6);
    });

    it("derives weekday for a Monday startDate (= 0)", () => {
      // 2026-09-07 is a Monday → schema weekday should be 0.
      const s = validConsumerState();
      s.paidMode = "free";
      s.startDate = "2026-09-07";
      s.scheduleSlots = [
        { weekday: 3, start_time: "18:00", duration_minutes: 90 },
      ];
      const out = buildCreateInput(s, "event", eventConfig);
      expect(out.schedule_slots[0].weekday).toBe(0);
    });

    it("mirrors end_date to start_date for events", () => {
      const s = validConsumerState();
      s.paidMode = "free";
      s.startDate = "2026-09-07";
      s.endDate = ""; // event end_date is hidden in the UI
      s.scheduleSlots = [
        { weekday: 0, start_time: "18:00", duration_minutes: 90 },
      ];
      const out = buildCreateInput(s, "event", eventConfig);
      expect(out.start_date).toBe("2026-09-07");
      expect(out.end_date).toBe("2026-09-07");
    });
  });

  describe("status / visibility independence", () => {
    // `draft` is reserved for a future "save incomplete product" flow.
    // The form only ever creates fully-validated products, so it always
    // emits `status: "pending"` — visibility is its own knob.
    it("visible product is created as pending", () => {
      const s = validConsumerState();
      s.isVisible = true;
      const out = buildCreateInput(s, "consumer_club", consumerConfig);
      expect(out.is_visible).toBe(true);
      expect(out.status).toBe("pending");
    });

    it("hidden product is also created as pending (not draft)", () => {
      const s = validConsumerState();
      s.isVisible = false;
      const out = buildCreateInput(s, "consumer_club", consumerConfig);
      expect(out.is_visible).toBe(false);
      expect(out.status).toBe("pending");
    });
  });

  describe("registration_opens_at assembly", () => {
    it("interprets the picked time as Helsinki, not the runner's timezone", () => {
      const s = validConsumerState();
      s.registrationOpensMode = "scheduled";
      s.registrationOpensDate = "2026-09-01";
      s.registrationOpensHour = "10";
      s.registrationOpensMinute = "30";
      const out = buildCreateInput(s, "consumer_club", consumerConfig);
      // 2026-09-01 10:30 Helsinki = EEST (UTC+3) → 07:30 UTC. Asserting the
      // exact ISO would silently start passing if we accidentally reverted
      // to browser-local parsing in any non-UTC test runner.
      expect(out.registration_opens_at).toBe("2026-09-01T07:30:00.000Z");
    });

    it("resolves immediate mode to ~now", () => {
      const s = validConsumerState();
      s.registrationOpensMode = "immediately";
      s.registrationOpensDate = "2026-09-01"; // ignored
      const before = Date.now();
      const out = buildCreateInput(s, "consumer_club", consumerConfig);
      const after = Date.now();
      const t = new Date(out.registration_opens_at).getTime();
      expect(t).toBeGreaterThanOrEqual(before);
      expect(t).toBeLessThanOrEqual(after);
    });
  });

  it("trims translation name and description", () => {
    const s = validConsumerState();
    s.translations = {
      en: { name: "  Padded Club  ", description: "  Padded desc  " },
    };
    const out = buildCreateInput(s, "consumer_club", consumerConfig);
    expect(out.translations[0]).toEqual({
      locale: "en",
      name: "Padded Club",
      description: "Padded desc",
    });
  });

  it("emits null padlet_url when blank, trims when set", () => {
    const s = validConsumerState();
    s.padletUrl = "";
    expect(
      buildCreateInput(s, "consumer_club", consumerConfig).padlet_url,
    ).toBeNull();
    s.padletUrl = "  https://padlet.com/x  ";
    expect(
      buildCreateInput(s, "consumer_club", consumerConfig).padlet_url,
    ).toBe("https://padlet.com/x");
  });

  it("emits null seat_count when free event is uncapped", () => {
    const s = validConsumerState();
    s.paidMode = "free";
    s.uncapped = true;
    s.seatCount = "";
    s.startDate = "2026-09-01";
    s.scheduleSlots = [
      { weekday: 0, start_time: "18:00", duration_minutes: 90 },
    ];
    const out = buildCreateInput(s, "event", eventConfig);
    expect(out.seat_count).toBeNull();
  });

  it("only emits signup_threshold when the start mode uses one", () => {
    const s = validConsumerState();
    s.startMode = "date"; // no threshold
    s.signupThreshold = "5"; // stale UI input
    const out = buildCreateInput(s, "consumer_club", consumerConfig);
    expect(out.signup_threshold).toBeNull();

    s.startMode = "date_and_threshold";
    s.signupThreshold = "5";
    s.startDate = "2026-09-01";
    const out2 = buildCreateInput(s, "consumer_club", consumerConfig);
    expect(out2.signup_threshold).toBe(5);
  });

  it("locks timezone to Europe/Helsinki", () => {
    const s = validConsumerState();
    const out = buildCreateInput(s, "consumer_club", consumerConfig);
    expect(out.timezone).toBe("Europe/Helsinki");
  });
});

// A fully-populated detail row to clone from. Visible, with an image, two
// locale names, prices, a schedule, and a real start date — so the clone's
// "copy everything except the image, append the suffix to names" contract
// can be checked against verbatim copies.
function mockDetailRow(
  overrides: Partial<ProductAdminDetailRow> = {},
): ProductAdminDetailRow {
  return {
    id: "prod-1",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "admin-1",
    updated_at: "2026-01-01T00:00:00Z",
    product_type: "consumer_club",
    status: "pending",
    billing_mode: "paid",
    is_visible: true,
    is_remote: true,
    location_id: null,
    topic: "minecraft",
    min_age: 8,
    max_age: 12,
    spoken_language_code: "en",
    padlet_url: "https://padlet.com/x",
    image_path: "products/original.png",
    start_date: "2026-09-01",
    end_date: null,
    signup_threshold: null,
    seat_count: 10,
    waitlist_enabled: false,
    refund_policy_days: null,
    registration_opens_at: "2020-01-01T00:00:00Z",
    timezone: "Europe/Helsinki",
    product_translations: [
      {
        product_id: "prod-1",
        locale: "en",
        name: "Summer Club",
        description: "A great club",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        product_id: "prod-1",
        locale: "fi",
        name: "Kesäkerho",
        description: "Mahtava kerho",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    product_prices: [
      { currency: "eur", price_per_session: 1000, price_per_month: 3000 },
    ],
    schedule_slots: [
      { weekday: 1, start_time: "16:00", duration_minutes: 90 },
    ],
    locations: null,
    product_holiday_calendars: [],
    ...overrides,
  };
}

describe("cloneFormState", () => {
  it("clears the image so the clone can't share the source's bucket file", () => {
    const state = cloneFormState(
      mockDetailRow(),
      consumerConfig,
      "en",
      " (Copy)",
    );
    expect(state.image).toBeNull();
  });

  it("appends the suffix to every locale's name, leaving descriptions intact", () => {
    const state = cloneFormState(
      mockDetailRow(),
      consumerConfig,
      "en",
      " (Copy)",
    );
    expect(state.translations.en).toEqual({
      name: "Summer Club (Copy)",
      description: "A great club",
    });
    expect(state.translations.fi).toEqual({
      name: "Kesäkerho (Copy)",
      description: "Mahtava kerho",
    });
  });

  it("copies dates, schedule, prices and visibility verbatim", () => {
    const state = cloneFormState(
      mockDetailRow(),
      consumerConfig,
      "en",
      " (Copy)",
    );
    expect(state.startDate).toBe("2026-09-01");
    expect(state.scheduleSlots).toEqual([
      { weekday: 1, start_time: "16:00", duration_minutes: 90 },
    ]);
    expect(state.prices.eur).toEqual({ session: "10.00", month: "30.00" });
    expect(state.isVisible).toBe(true);
  });

  it("preserves a hidden source's visibility (does not force-hide)", () => {
    const state = cloneFormState(
      mockDetailRow({ is_visible: false }),
      consumerConfig,
      "en",
      " (Copy)",
    );
    expect(state.isVisible).toBe(false);
  });

  it("round-trips into a create payload that drops the image", () => {
    const state = cloneFormState(
      mockDetailRow(),
      consumerConfig,
      "en",
      " (Copy)",
    );
    const out = buildCreateInput(state, "consumer_club", consumerConfig);
    expect(out.image).toBeNull();
    expect(out.status).toBe("pending");
    expect(out.translations).toContainEqual({
      locale: "en",
      name: "Summer Club (Copy)",
      description: "A great club",
    });
  });
});
