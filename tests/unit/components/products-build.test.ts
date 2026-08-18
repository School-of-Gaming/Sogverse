import { formatInTimeZone } from "date-fns-tz";
import { describe, it, expect } from "vitest";
import {
  buildCreateInput,
  buildUpdateInput,
  cloneFormState,
  existingFormState,
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
    en: {
      name: "Test Club",
      shortDescription: "A great club",
      longDescription: "",
    },
  };
  s.activeLocale = "en";
  s.topic = "minecraft_java";
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
  };
  // A paid club defaults uncapped (soft caps are opt-in), so the baseline
  // "capped club" opts back into a real seat count explicitly.
  s.uncapped = false;
  s.seatCount = "10";
  return s;
}

// A municipality club that passes validation — its fee section is the only one
// that surfaces the municipality fee row. Muni clubs need a location (the
// funding municipality) and an end date (weekly_bounded), and bill via external
// contract so no price is collected.
function validMuniState(): FormState {
  const s = initialState(muniConfig, "en");
  s.translations = {
    en: { name: "Muni Club", shortDescription: "A muni club", longDescription: "" },
  };
  s.activeLocale = "en";
  s.topic = "minecraft_java";
  s.spokenLanguageCode = "en";
  s.isRemote = true;
  s.locationId = "00000000-0000-0000-0000-0000000000aa";
  s.startMode = "date";
  s.startDate = "2026-09-01";
  s.endDate = "2026-12-01";
  s.scheduleSlots = [{ weekday: 1, start_time: "16:00", duration_minutes: 90 }];
  s.uncapped = false;
  s.seatCount = "12";
  return s;
}

// A camp that passes validation: multi_day_bounded, so it needs both dates, and
// paid by default, so it carries the upfront total in the `session` slot.
function validCampState(): FormState {
  const s = initialState(campConfig, "en");
  s.translations = {
    en: { name: "Test Camp", shortDescription: "A great camp", longDescription: "" },
  };
  s.activeLocale = "en";
  s.topic = "minecraft_java";
  s.spokenLanguageCode = "en";
  s.isRemote = true;
  s.startMode = "date";
  s.startDate = "2026-09-01";
  s.endDate = "2026-09-05";
  s.scheduleSlots = [
    { weekday: 0, start_time: "10:00", duration_minutes: 180 },
    { weekday: 2, start_time: "10:00", duration_minutes: 180 },
  ];
  s.prices = { eur: { session: "120.00", month: "" } };
  return s;
}

// An event that passes validation: single_date, so it needs no end date, and
// free by default — the paid cases below opt in and add a total.
function validEventState(): FormState {
  const s = initialState(eventConfig, "en");
  s.translations = {
    en: { name: "Test Event", shortDescription: "A great event", longDescription: "" },
  };
  s.activeLocale = "en";
  s.topic = "minecraft_java";
  s.spokenLanguageCode = "en";
  s.isRemote = true;
  s.startMode = "date";
  s.startDate = "2026-09-01";
  s.scheduleSlots = [{ weekday: 0, start_time: "18:00", duration_minutes: 90 }];
  s.seatCount = "30";
  return s;
}

describe("validate", () => {
  describe("translations", () => {
    it("requires at least one filled locale", () => {
      const s = validConsumerState();
      s.translations = {
        en: { name: "", shortDescription: "", longDescription: "" },
      };
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
        sv: { name: "Klubb", shortDescription: "En klubb", longDescription: "" },
      };
      expect(validate(s, consumerConfig)).toBeNull();
    });

    it("rejects a half-filled locale tab", () => {
      const s = validConsumerState();
      s.translations = {
        en: {
          name: "Test Club",
          shortDescription: "A great club",
          longDescription: "",
        },
        sv: { name: "Klubb", shortDescription: "", longDescription: "" },
      };
      const result = validate(s, consumerConfig);
      // The locale *code*: the validator is pure, so the form resolves the
      // viewer-locale display name at the t() call site.
      expect(result).toEqual({
        messageKey: "translationIncomplete",
        values: { locale: "sv" },
      });
    });

    it("accepts whitespace-only as empty (trims for emptiness check)", () => {
      const s = validConsumerState();
      s.translations = {
        en: { name: "   ", shortDescription: "   ", longDescription: "" },
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

    it("rejects an invalid material URL", () => {
      const s = validConsumerState();
      s.materialUrl = "not-a-url";
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "materialUrlInvalid",
      });
    });

    it("accepts a blank material URL (optional field)", () => {
      const s = validConsumerState();
      s.materialUrl = "";
      expect(validate(s, consumerConfig)).toBeNull();
    });

    // The link field ends up as the `href` of an anchor somebody clicks, so
    // "parses as a URL" is not the bar — `new URL()` is perfectly happy with a
    // script URI, and storing one is a stored-XSS hole with an extra step. The
    // rule is an allow-list of the two web schemes, and these are the cases that
    // hold it there.
    const HOSTILE_SCHEMES = [
      "javascript:alert(1)",
      // Uppercased, because the URL parser normalizes the scheme and a
      // hand-rolled `startsWith("javascript:")` check would not.
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      // Parses fine and is not the web: a file path is not a lesson plan.
      "file:///etc/passwd",
    ];

    for (const hostile of HOSTILE_SCHEMES) {
      it(`rejects ${hostile.split(":")[0]}: as a material URL`, () => {
        const s = validConsumerState();
        s.materialUrl = hostile;
        expect(validate(s, consumerConfig)?.messageKey).toBe(
          "materialUrlInvalid",
        );
      });
    }

    it("accepts http and https on the link field", () => {
      // The allow-list has to stay an allow-list of *two*: dropping plain http
      // would break every link an admin has already saved.
      for (const scheme of ["http", "https"]) {
        const s = validConsumerState();
        s.materialUrl = `${scheme}://drive.sog.gg/lesson-plans`;
        expect(validate(s, consumerConfig), scheme).toBeNull();
      }
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

    // The DB CHECK the form is standing in front of: a product nobody can take
    // a seat on is not a product. The section makes the state unreachable by
    // disabling the last remaining tick; this is the backstop behind it.
    it("rejects a product with no audience at all", () => {
      const s = validConsumerState();
      s.forGamers = false;
      s.forParents = false;
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "audienceRequired",
      });
    });

    // `Number("")` is 0, a perfectly valid age — so emptiness has to be its own
    // question, asked before the parse, and answered in its own words.
    it("rejects a blank min age while For gamers is ticked", () => {
      const s = validConsumerState();
      s.minAge = "";
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "minAgeRequired",
      });
    });

    it("rejects a blank max age while For gamers is ticked", () => {
      const s = validConsumerState();
      s.maxAge = "";
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "maxAgeRequired",
      });
    });

    it("rejects whitespace-only ages while For gamers is ticked", () => {
      const s = validConsumerState();
      s.minAge = "  ";
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "minAgeRequired",
      });
    });

    it("accepts blank ages on a parents-only product", () => {
      const s = validConsumerState();
      s.forGamers = false;
      s.forParents = true;
      s.minAge = "";
      s.maxAge = "";
      expect(validate(s, consumerConfig)).toBeNull();
    });

    // Unticking For gamers hides the fields without emptying them, so whatever
    // was typed is still sitting in state at submit. It must not be judged: the
    // payload builder is going to drop it on the floor either way.
    it("ignores a stale, self-contradicting range once For gamers is unticked", () => {
      const s = validConsumerState();
      s.forGamers = false;
      s.forParents = true;
      s.minAge = "10";
      s.maxAge = "5";
      expect(validate(s, consumerConfig)).toBeNull();
    });

    it("still requires a valid range on a both-audience product", () => {
      const s = validConsumerState();
      s.forParents = true; // forGamers stays ticked
      s.minAge = "";
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "minAgeRequired",
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
      s.hasEndDate = false;
      s.endDate = "";
      expect(validate(s, consumerConfig)).toBeNull();
    });

    it("requires endDate for a consumer club once an end date is opted in", () => {
      const s = validConsumerState();
      s.hasEndDate = true;
      s.endDate = "";
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "endDateRequired",
      });
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

    it("asks for a blank seat count in its own words", () => {
      // Not "must be a positive integer" — nothing was typed, so there is
      // nothing wrong with what was typed, and the number-shaped complaint
      // sends the admin looking for a mistake they did not make.
      const s = validConsumerState();
      s.seatCount = "";
      expect(validate(s, consumerConfig)).toEqual({
        messageKey: "seatCountRequired",
      });
    });

    it("requires a cap on a municipality club", () => {
      // The one type with no uncapped option: it is contracted for a specific
      // number of places. A stored uncapped muni row loads as capped-and-blank
      // (see existingFormState), so this is also the heal-on-write refusal.
      const s = validMuniState();
      s.seatCount = "";
      expect(validate(s, muniConfig)).toEqual({
        messageKey: "seatCountRequired",
      });
    });

    it("heals a stored uncapped municipality club into a required cap", () => {
      // The edit-path half of the rule above, which is why it belongs here and
      // not among the payload builders: nothing is built. Muni has no uncapped
      // option, so the row loads as capped-with-a-blank number and validation
      // demands the contracted figure before any payload can be built at all.
      const state = existingFormState(
        mockDetailRow({
          product_type: "municipality_club",
          billing_mode: "external_contract",
          seat_count: null,
          // A muni club is bounded and anchors to its funding municipality;
          // without these, validation stops before it reaches the seat count.
          end_date: "2026-12-01",
          location_id: "00000000-0000-0000-0000-0000000000aa",
        }),
        muniConfig,
        "en",
      );

      expect(state.uncapped).toBe(false);
      expect(state.seatCount).toBe("");
      expect(validate(state, muniConfig)).toEqual({
        messageKey: "seatCountRequired",
      });
    });

    it("accepts a free consumer club", () => {
      // Clubs became free-or-paid; a free one collects no price at all, so the
      // blank price map the paid path would refuse is fine here.
      const s = validConsumerState();
      s.paidMode = "free";
      s.prices = { eur: { session: "", month: "" } };
      expect(validate(s, consumerConfig)).toBeNull();
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

    it("allows a paid consumer club to be uncapped (no seat count)", () => {
      // Seat caps are now orthogonal to billing — any type may opt out of a
      // seat count, not just free events. (DB constraint
      // chk_products_seat_count_null_requires_free was dropped in 00083.)
      const s = validConsumerState();
      s.uncapped = true;
      s.seatCount = "";
      expect(validate(s, consumerConfig)).toBeNull();
    });

    it("rejects missing monthly price for paid consumer clubs", () => {
      const s = validConsumerState();
      s.prices.eur = { session: "8.50", month: "" };
      const result = validate(s, consumerConfig);
      expect(result).toEqual({
        messageKey: "priceMonthMissing",
        values: { currency: "EUR" },
      });
    });

    // A paid product's price is validated through the exact value the payload
    // will store, and it has to reach the currency's minimum charge at Stripe.
    // Zero is not a price the admin may type: "free" is the billing radio's
    // answer, and a €0 paid product would advertise a checkout the server has
    // nothing to charge for. The failure carries the minimum in *cents* — the
    // form formats it into the viewer's money string.
    const EUR_MINIMUM = { currency: "EUR", minimum: 50 };

    it("rejects a negative or malformed monthly price", () => {
      for (const month of ["-30.00", "abc", "1e999"]) {
        const s = validConsumerState();
        s.prices.eur = { session: "10.00", month };
        expect(validate(s, consumerConfig), month).toEqual({
          messageKey: "priceMonthInvalid",
          values: EUR_MINIMUM,
        });
      }
    });

    it("rejects a zero monthly price on a paid consumer club", () => {
      for (const month of ["0", "0.00", "0.001"]) {
        const s = validConsumerState();
        s.prices.eur = { session: "10.00", month };
        expect(validate(s, consumerConfig), month).toEqual({
          messageKey: "priceMonthInvalid",
          values: EUR_MINIMUM,
        });
      }
    });

    it("rejects a zero upfront total on a paid camp and a paid event", () => {
      for (const session of ["0", "0.00"]) {
        const camp = validCampState();
        camp.prices.eur = { session, month: "" };
        expect(validate(camp, campConfig), session).toEqual({
          messageKey: "priceSessionInvalid",
          values: EUR_MINIMUM,
        });

        const event = validEventState();
        event.paidMode = "paid";
        event.prices.eur = { session, month: "" };
        expect(validate(event, eventConfig), session).toEqual({
          messageKey: "priceSessionInvalid",
          values: EUR_MINIMUM,
        });
      }
    });

    // Under Stripe's €0.50 floor a price is not merely small, it is unsellable:
    // Stripe refuses the charge with `amount_too_small`, so the product saves
    // fine and then fails at checkout, on the family rather than on the admin
    // who typed it. Rejecting only zero left this whole band open.
    it("rejects a price below the currency's minimum charge", () => {
      for (const month of ["0.01", "0.49"]) {
        const s = validConsumerState();
        s.prices.eur = { session: "", month };
        expect(validate(s, consumerConfig), month).toEqual({
          messageKey: "priceMonthInvalid",
          values: EUR_MINIMUM,
        });
      }

      // The same band on the other shape: the floor is the currency's, so it
      // binds a camp's upfront total exactly as it binds a club's month, and
      // both ends of the band are checked on both.
      for (const session of ["0.01", "0.49"]) {
        const camp = validCampState();
        camp.prices.eur = { session, month: "" };
        expect(validate(camp, campConfig), session).toEqual({
          messageKey: "priceSessionInvalid",
          values: EUR_MINIMUM,
        });
      }
    });

    it("accepts a price exactly at the currency's minimum charge", () => {
      const s = validConsumerState();
      s.prices.eur = { session: "", month: "0.50" };
      expect(validate(s, consumerConfig)).toBeNull();

      const camp = validCampState();
      camp.prices.eur = { session: "0.50", month: "" };
      expect(validate(camp, campConfig)).toBeNull();
    });

    it("accepts a free camp with no price at all", () => {
      // Camps became free-or-paid alongside clubs and events; a free one
      // collects no price, so the blank map the paid path refuses is fine.
      const s = validCampState();
      s.paidMode = "free";
      s.prices = { eur: { session: "", month: "" } };
      expect(validate(s, campConfig)).toBeNull();
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
  it("converts the monthly price to cents as price_cents for clubs", () => {
    // Consumer clubs charge a flat monthly subscription, so the monthly input
    // becomes price_cents and the session input is ignored. See decimalToCents
    // in src/lib/utils.ts.
    const s = validConsumerState();
    s.prices.eur = { session: "10.005", month: "30.99" };
    const out = buildCreateInput(s, "consumer_club", consumerConfig);
    expect(out.prices).toEqual([{ currency: "eur", price_cents: 3099 }]);
  });

  it("uses the upfront total as price_cents for upfront_total products (camp)", () => {
    const s = validConsumerState();
    s.scheduleSlots = [
      { weekday: 0, start_time: "10:00", duration_minutes: 180 },
    ];
    s.startDate = "2026-09-01";
    s.endDate = "2026-09-05";
    s.prices = {
      eur: { session: "100", month: "" },
    };
    const out = buildCreateInput(s, "camp", campConfig);
    expect(out.prices).toEqual([{ currency: "eur", price_cents: 10000 }]);
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

  it("writes a consumer club's end_date only when one is opted in", () => {
    // Ongoing (the default) → null; opting into a date carries it through.
    const ongoing = validConsumerState();
    expect(ongoing.hasEndDate).toBe(false);
    expect(
      buildCreateInput(ongoing, "consumer_club", consumerConfig).end_date
    ).toBe(null);

    const dated = validConsumerState();
    dated.hasEndDate = true;
    dated.endDate = "2026-12-15";
    expect(
      buildCreateInput(dated, "consumer_club", consumerConfig).end_date
    ).toBe("2026-12-15");
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

  it("emits empty prices for a free camp, exactly as for a free event", () => {
    // The enrollment path branches on billing_mode and never on type, so a free
    // camp is the same wire shape a free event is.
    const s = validCampState();
    s.paidMode = "free";
    s.prices = { eur: { session: "", month: "" } };
    const out = buildCreateInput(s, "camp", campConfig);
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

  describe("status / listing independence", () => {
    // The form only ever creates fully-validated products, so it always emits
    // `status: "pending"` — the first state of the lifecycle. Listing is its
    // own knob and says nothing about the lifecycle: an unlisted product is
    // pending exactly like a listed one, and just as purchasable by link.
    it("listed product is created as pending", () => {
      const s = validConsumerState();
      s.isVisible = true;
      const out = buildCreateInput(s, "consumer_club", consumerConfig);
      expect(out.is_visible).toBe(true);
      expect(out.status).toBe("pending");
    });

    it("unlisted product is also created as pending", () => {
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
      en: {
        name: "  Padded Club  ",
        shortDescription: "  Padded desc  ",
        longDescription: "",
      },
    };
    const out = buildCreateInput(s, "consumer_club", consumerConfig);
    expect(out.translations[0]).toEqual({
      locale: "en",
      name: "Padded Club",
      short_description: "Padded desc",
      long_description: null,
    });
  });

  // Staff-facing, and it lands in its own table rather than on the product —
  // so the assertion is that it is emitted at all, and emitted trimmed.
  it("emits null material_url when blank, trims when set", () => {
    const s = validConsumerState();
    s.materialUrl = "";
    expect(
      buildCreateInput(s, "consumer_club", consumerConfig).material_url,
    ).toBeNull();
    s.materialUrl = "  https://drive.sog.gg/lesson-plans  ";
    expect(
      buildCreateInput(s, "consumer_club", consumerConfig).material_url,
    ).toBe("https://drive.sog.gg/lesson-plans");
  });

  it("rejects a material_url that is not a valid URL", () => {
    const s = validConsumerState();
    s.materialUrl = "drive.sog.gg/lesson-plans";
    expect(validate(s, consumerConfig)?.messageKey).toBe("materialUrlInvalid");
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

  it("emits null seat_count when a paid consumer club is uncapped", () => {
    const s = validConsumerState();
    s.uncapped = true;
    s.seatCount = ""; // ignored when uncapped
    const out = buildCreateInput(s, "consumer_club", consumerConfig);
    expect(out.seat_count).toBeNull();
    expect(out.billing_mode).toBe("paid");
  });

  it("emits a free, hard-capped consumer club with no prices", () => {
    // The free club: billing_mode free, so the cap the RPC validates before it
    // writes the seat is a hard one, and no price rows are collected at all.
    const s = validConsumerState();
    s.paidMode = "free";
    s.uncapped = false;
    s.seatCount = "16";
    s.waitlistEnabled = true;
    const out = buildCreateInput(s, "consumer_club", consumerConfig);
    expect(out.billing_mode).toBe("free");
    expect(out.seat_count).toBe(16);
    expect(out.waitlist_enabled).toBe(true);
    expect(out.prices).toEqual([]);
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

// The audience flags and the age range are one decision on the wire: ages are a
// property of the gamer audience, so they are present exactly when `for_gamers`
// is — enforced by a CHECK, which makes every shape below a save that either
// works or is refused outright.
describe("audience and ages on the wire", () => {
  it("creates a for-gamers product with its range by default", () => {
    // The create form's seeded audience, unread and unedited: children, with
    // the default range. Every product the form could make before audiences
    // existed had exactly this shape.
    const s = initialState(consumerConfig, "en");
    expect(s.forGamers).toBe(true);
    expect(s.forParents).toBe(false);

    const out = buildCreateInput(
      validConsumerState(),
      "consumer_club",
      consumerConfig,
    );
    expect(out.for_gamers).toBe(true);
    expect(out.for_parents).toBe(false);
    expect(out.min_age).toBe(7);
    expect(out.max_age).toBe(12);
  });

  it("emits null ages for a parents-only product, not 0 and not \"null\"", () => {
    const s = validConsumerState();
    s.forGamers = false;
    s.forParents = true;
    s.minAge = "";
    s.maxAge = "";
    const out = buildCreateInput(s, "consumer_club", consumerConfig);

    expect(out.for_gamers).toBe(false);
    expect(out.for_parents).toBe(true);
    // The two ways this has gone wrong: `Number("")` is 0 (a real age the DB
    // would store, and a CHECK violation on a product with no gamer audience),
    // and `String(null)` is "null" (which parses back as NaN).
    expect(out.min_age).toBeNull();
    expect(out.max_age).toBeNull();
    expect(out.min_age).not.toBe(0);
    expect(out.max_age).not.toBe(0);
  });

  // Unticking For gamers hides the age fields without emptying them, so the
  // typed range survives a mis-click for as long as the form is open. What must
  // not survive is the range reaching the database — the flag decides, not the
  // boxes.
  it("drops a still-typed range once For gamers is unticked", () => {
    const s = validConsumerState();
    s.forGamers = false;
    s.forParents = true;
    s.minAge = "7";
    s.maxAge = "12";
    const out = buildCreateInput(s, "consumer_club", consumerConfig);
    expect(out.min_age).toBeNull();
    expect(out.max_age).toBeNull();
  });

  it("keeps the range on a both-audience product", () => {
    const s = validConsumerState();
    s.forParents = true;
    s.minAge = "9";
    s.maxAge = "14";
    const out = buildCreateInput(s, "consumer_club", consumerConfig);
    expect(out.for_gamers).toBe(true);
    expect(out.for_parents).toBe(true);
    expect(out.min_age).toBe(9);
    expect(out.max_age).toBe(14);
  });

  // Every product type gets the checkboxes — the capability is deliberately not
  // narrowed to events, which is only where it is expected to be used first.
  it("carries the audience on every product type", () => {
    const camp = validConsumerState();
    camp.forGamers = false;
    camp.forParents = true;
    camp.minAge = "";
    camp.maxAge = "";
    camp.endDate = "2026-09-05";
    camp.prices = { eur: { session: "120.00", month: "" } };
    const out = buildCreateInput(camp, "camp", campConfig);
    expect(out.for_gamers).toBe(false);
    expect(out.for_parents).toBe(true);
    expect(out.min_age).toBeNull();
  });
});

// The design tag rides on the same payload as the audience above but answers a
// different question — who the sessions were built for, not who may hold a seat
// — so it gets its own block rather than being folded into the audience cases.
describe("the design tag on the wire", () => {
  it("creates an untagged product by default", () => {
    const s = initialState(consumerConfig, "en");
    expect(s.tag).toBeNull();

    const out = buildCreateInput(
      validConsumerState(),
      "consumer_club",
      consumerConfig,
    );
    // Present and null, never absent. The wire schema requires the field and
    // the RPC parameter is DEFAULT NULL, so a missing key is a 400 rather than
    // a quietly untagged product.
    expect(out).toHaveProperty("tag");
    expect(out.tag).toBeNull();
  });

  it("carries a chosen tag through to the create payload", () => {
    const s = validConsumerState();
    s.tag = "neuroinclusive";
    expect(buildCreateInput(s, "consumer_club", consumerConfig).tag).toBe(
      "neuroinclusive",
    );
  });

  it("carries a chosen tag through to the update payload", () => {
    const s = validConsumerState();
    s.tag = "advanced";
    expect(buildUpdateInput(s, consumerConfig).tag).toBe("advanced");
  });

  // Clearing has to be expressible, and it has to travel as an explicit null:
  // the update RPC assigns every editable column, so a field that went missing
  // would make "leave the tag alone" and "clear the tag" the same wire shape.
  it("emits an explicit null when a tagged product is untagged again", () => {
    const s = validConsumerState();
    s.tag = "beginner";
    expect(buildUpdateInput(s, consumerConfig).tag).toBe("beginner");

    s.tag = null;
    const cleared = buildUpdateInput(s, consumerConfig);
    expect(cleared).toHaveProperty("tag");
    expect(cleared.tag).toBeNull();
  });

  it("carries the tag on every product type", () => {
    const camp = validConsumerState();
    camp.tag = "beginner";
    camp.endDate = "2026-09-05";
    camp.prices = { eur: { session: "120.00", month: "" } };
    expect(buildCreateInput(camp, "camp", campConfig).tag).toBe("beginner");
  });

});

// The region lock is a third dimension again: the audience says who may hold a
// seat, the tag says who the sessions were built for, and this says where those
// people have to live. Its wire discipline is the tag's — required-nullable,
// with an explicit null meaning "unlocked" — plus one rule of its own: a type
// that offers no lock never sends one.
describe("the region lock on the wire", () => {
  it("creates an unlocked product by default", () => {
    const s = initialState(consumerConfig, "en");
    expect(s.regionLockCountry).toBeNull();

    const out = buildCreateInput(
      validConsumerState(),
      "consumer_club",
      consumerConfig,
    );
    // Present and null, never absent — same reason as the tag: the RPC
    // parameter is DEFAULT NULL, so a missing key would unlock silently.
    expect(out).toHaveProperty("region_lock_country");
    expect(out.region_lock_country).toBeNull();
  });

  it("carries a chosen country through create and update alike", () => {
    const s = validConsumerState();
    s.regionLockCountry = "FI";
    expect(
      buildCreateInput(s, "consumer_club", consumerConfig).region_lock_country,
    ).toBe("FI");
    expect(buildUpdateInput(s, consumerConfig).region_lock_country).toBe("FI");
  });

  it("emits an explicit null when a locked product is unlocked again", () => {
    const s = validConsumerState();
    s.regionLockCountry = "SE";
    expect(buildUpdateInput(s, consumerConfig).region_lock_country).toBe("SE");

    s.regionLockCountry = null;
    const cleared = buildUpdateInput(s, consumerConfig);
    expect(cleared).toHaveProperty("region_lock_country");
    expect(cleared.region_lock_country).toBeNull();
  });

  it("forces null for a type that offers no lock", () => {
    // Municipality clubs are the one non-lockable type — their country is
    // settled by the separate countryBound mechanism — and the form hides the
    // control for them. A draft can still be *carrying* a code (a state object
    // built for another type, or a row locked before the flag existed), so the
    // payload builder is where the type's answer is imposed: one gate on the
    // write rather than one on every path to it.
    const s = validConsumerState();
    s.regionLockCountry = "FI";
    s.endDate = "2027-05-31";
    s.uncapped = false;
    s.seatCount = "12";
    expect(buildUpdateInput(s, muniConfig).region_lock_country).toBeNull();
    // And the lockable types are unaffected by that rule.
    expect(buildUpdateInput(s, campConfig).region_lock_country).toBe("FI");
  });
});

describe("fees", () => {
  it("maps fee drafts to cents: fee→cents, volunteer→0, unknown/none→null", () => {
    const s = validConsumerState();
    s.primaryGeduFee = { status: "fee", amount: "25.00" };
    s.assistantGeduFee = { status: "volunteer", amount: "" };
    const out = buildCreateInput(s, "consumer_club", consumerConfig);
    expect(out.primary_gedu_fee_cents).toBe(2500);
    expect(out.assistant_gedu_fee_cents).toBe(0);
  });

  it("defaults primary gedu to unknown (null) and assistant to none (null)", () => {
    const out = buildCreateInput(
      validConsumerState(),
      "consumer_club",
      consumerConfig,
    );
    expect(out.primary_gedu_fee_cents).toBeNull();
    expect(out.assistant_gedu_fee_cents).toBeNull();
  });

  it("forces municipality fee to null for non-municipality products", () => {
    const s = validConsumerState();
    // A stale muni draft (the section is hidden for consumer clubs) must not
    // leak — the DB CHECK rejects a muni fee on a non-muni product.
    s.municipalityFee = { status: "fee", amount: "50.00" };
    const out = buildCreateInput(s, "consumer_club", consumerConfig);
    expect(out.municipality_fee_cents).toBeNull();
  });

  it("persists the municipality fee for municipality clubs", () => {
    const s = validConsumerState();
    s.municipalityFee = { status: "fee", amount: "40.00" };
    const out = buildCreateInput(s, "municipality_club", muniConfig);
    expect(out.municipality_fee_cents).toBe(4000);
  });

  it("rejects a 'fee' status with a missing or zero amount", () => {
    const s = validConsumerState();
    s.primaryGeduFee = { status: "fee", amount: "" };
    expect(validate(s, consumerConfig)).toEqual({
      messageKey: "primaryGeduFeeInvalid",
    });
    s.primaryGeduFee = { status: "fee", amount: "0" };
    expect(validate(s, consumerConfig)).toEqual({
      messageKey: "primaryGeduFeeInvalid",
    });
  });

  it("accepts unknown / volunteer / none without an amount", () => {
    const s = validConsumerState();
    s.primaryGeduFee = { status: "volunteer", amount: "" };
    s.assistantGeduFee = { status: "none", amount: "" };
    expect(validate(s, consumerConfig)).toBeNull();
  });

  it("ignores an invalid municipality fee draft on a non-muni club", () => {
    const s = validConsumerState();
    // The muni section is hidden for consumer clubs, so a stale invalid draft
    // must not block submit.
    s.municipalityFee = { status: "fee", amount: "" };
    expect(validate(s, consumerConfig)).toBeNull();
  });

  it("catches an invalid municipality fee on a municipality club", () => {
    const s = validMuniState();
    expect(validate(s, muniConfig)).toBeNull();
    s.municipalityFee = { status: "fee", amount: "" };
    expect(validate(s, muniConfig)).toEqual({
      messageKey: "municipalityFeeInvalid",
    });
  });

  it("round-trips cents back into fee drafts via existingFormState", () => {
    const state = existingFormState(
      mockDetailRow({
        primary_gedu_fee_cents: 2500,
        assistant_gedu_fee_cents: 0,
        municipality_fee_cents: null,
      }),
      consumerConfig,
      "en",
    );
    expect(state.primaryGeduFee).toEqual({ status: "fee", amount: "25.00" });
    expect(state.assistantGeduFee).toEqual({ status: "volunteer", amount: "" });
    expect(state.municipalityFee).toEqual({ status: "unknown", amount: "" });
  });
});

// The waitlist is the queue *behind* a cap, so `seat_count null` +
// `waitlist_enabled true` is not a configuration — it is a queue with nothing to
// queue for. The form can produce that pairing without anyone seeing it (the
// checkbox renders only while capped), so the payload derives the flag from the
// cap rather than copying the form's. These pin both directions of that.
describe("waitlist_enabled is derived from the cap, not copied", () => {
  it("submits no waitlist on an uncapped product, whatever the flag says", () => {
    const s = validConsumerState();
    s.uncapped = true;
    s.seatCount = "";
    s.waitlistEnabled = true; // ticked while capped, then switched to Unlimited

    const out = buildCreateInput(s, "consumer_club", consumerConfig);

    expect(out.seat_count).toBeNull();
    expect(out.waitlist_enabled).toBe(false);
  });

  it("corrects an already-stranded stored row on the next save", () => {
    // Rows predating this rule — and the column's own default — can hold the
    // pairing. Deriving on write means any later save of anything heals it,
    // rather than re-persisting the lie until someone edits the seat controls.
    const state = existingFormState(
      mockDetailRow({ seat_count: null, waitlist_enabled: true }),
      consumerConfig,
      "en",
    );
    expect(state.waitlistEnabled).toBe(true); // shown as stored, not wiped on load

    expect(buildUpdateInput(state, consumerConfig).waitlist_enabled).toBe(false);
  });

  it("restores the tick when the admin toggles Unlimited and back", () => {
    // The radio only moves `uncapped`, so the flag survives the detour — the
    // point of deriving on write rather than clearing in the handler.
    const capped = validConsumerState();
    capped.waitlistEnabled = true;

    const unlimited = { ...capped, uncapped: true };
    expect(buildCreateInput(unlimited, "consumer_club", consumerConfig)
      .waitlist_enabled).toBe(false);

    const limitedAgain = { ...unlimited, uncapped: false };
    const out = buildCreateInput(limitedAgain, "consumer_club", consumerConfig);
    expect(out.waitlist_enabled).toBe(true);
    expect(out.seat_count).toBe(10);
  });

  it("re-saves a stored capped event with its cap and waitlist intact", () => {
    // The invariant the event re-lock rests on: the form can no longer *create*
    // a capped event, and it must not quietly decap one created while the
    // controls were unlocked. The seat controls render disabled; a save of any
    // other field has to round-trip both values untouched. (The healing above
    // is scoped to uncapped rows — this row is capped, so nothing is derived
    // away.)
    const state = existingFormState(
      mockDetailRow({
        product_type: "event",
        billing_mode: "free",
        seat_count: 25,
        waitlist_enabled: true,
        end_date: "2026-09-01",
        schedule_slots: [
          { weekday: 1, start_time: "18:00", duration_minutes: 90 },
        ],
      }),
      eventConfig,
      "en",
    );
    expect(state.uncapped).toBe(false);
    expect(state.seatCount).toBe("25");
    expect(state.waitlistEnabled).toBe(true);

    expect(validate(state, eventConfig)).toBeNull();

    const out = buildUpdateInput(state, eventConfig);
    expect(out.seat_count).toBe(25);
    expect(out.waitlist_enabled).toBe(true);
  });

  it("normalises a locked type's future drop back to Right away", () => {
    // Deliberately the *opposite* call to the capped-event case above, and the
    // difference is what the lock means. A stored cap is data with money behind
    // it, so a re-lock must not silently decap a product families already see.
    // A registration window is the lock's own subject: "locked to Right away"
    // is not a statement about new events, it is what the type means. Deriving
    // `scheduled` here would also strand the form — both radios disabled on the
    // forbidden option, with only the date fields live.
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const state = existingFormState(
      mockDetailRow({ product_type: "event", registration_opens_at: future }),
      eventConfig,
      "en",
    );
    expect(state.registrationOpensMode).toBe("immediately");

    const before = Date.now();
    const out = buildUpdateInput(state, eventConfig);
    expect(new Date(out.registration_opens_at).getTime()).toBeGreaterThanOrEqual(
      before,
    );
  });

  it("still derives a scheduled drop where the chooser is unlocked", () => {
    // Municipality clubs are the one type that keeps the window, so the stored
    // timestamp must still round-trip into the pickers there. The instant is
    // pinned relative to *now* rather than to a literal date: a hardcoded
    // future timestamp is only in the future until it isn't, and this assertion
    // needs one that always is. 08:15Z is read back through the fixed Helsinki
    // zone, so the expected clock face is derived the same way rather than
    // hardcoded — the offset is +2 or +3 depending on where the 30-day hop
    // lands relative to DST.
    const opensAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    opensAt.setUTCHours(8, 15, 0, 0);
    const state = existingFormState(
      mockDetailRow({
        product_type: "municipality_club",
        registration_opens_at: opensAt.toISOString(),
      }),
      muniConfig,
      "en",
    );
    expect(state.registrationOpensMode).toBe("scheduled");
    expect(state.registrationOpensDate).toBe(
      formatInTimeZone(opensAt, "Europe/Helsinki", "yyyy-MM-dd"),
    );
    expect(
      `${state.registrationOpensHour}:${state.registrationOpensMinute}`,
    ).toBe(formatInTimeZone(opensAt, "Europe/Helsinki", "HH:mm"));
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
    topic: "minecraft_java",
    for_gamers: true,
    for_parents: false,
    min_age: 8,
    max_age: 12,
    tag: null,
    region_lock_country: null,
    spoken_language_code: "en",
    // The lesson link rides on its own staff-only row, not on the product.
    product_staff_details: { material_url: "https://drive.sog.gg/x" },
    image_path: "products/original.png",
    start_date: "2026-09-01",
    end_date: null,
    signup_threshold: null,
    seat_count: 10,
    waitlist_enabled: false,
    primary_gedu_fee_cents: null,
    assistant_gedu_fee_cents: null,
    municipality_fee_cents: null,
    registration_opens_at: "2020-01-01T00:00:00Z",
    timezone: "Europe/Helsinki",
    product_translations: [
      {
        product_id: "prod-1",
        locale: "en",
        name: "Summer Club",
        short_description: "A great club",
        long_description: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        product_id: "prod-1",
        locale: "fi",
        name: "Kesäkerho",
        short_description: "Mahtava kerho",
        long_description: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    product_prices: [{ currency: "eur", price_cents: 3000 }],
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
      shortDescription: "A great club",
      longDescription: "",
    });
    expect(state.translations.fi).toEqual({
      name: "Kesäkerho (Copy)",
      shortDescription: "Mahtava kerho",
      longDescription: "",
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
    // consumer_club is a monthly product, so the stored price_cents loads into
    // the `month` slot; the unused `session` slot stays blank.
    expect(state.prices.eur).toEqual({ session: "", month: "30.00" });
    expect(state.isVisible).toBe(true);
  });

  // A tag is data, not identity: nothing about it is bound to the one bucket
  // file the way the image is, so a clone carries the source's tag like it
  // carries the dates and the schedule.
  it("copies the source's tag", () => {
    const state = cloneFormState(
      mockDetailRow({ tag: "neuroinclusive" }),
      consumerConfig,
      "en",
      " (Copy)",
    );
    expect(state.tag).toBe("neuroinclusive");
    expect(
      buildCreateInput(state, "consumer_club", consumerConfig).tag,
    ).toBe("neuroinclusive");
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
      short_description: "A great club",
      long_description: null,
    });
  });
});

/**
 * **The long description is markdown, and blank means the column holds NULL.**
 *
 * The field is optional and left empty far more often than it is filled, and
 * the column's CHECK refuses an empty string — NULL is the single spelling of
 * "this locale has no long description". So the case worth pinning is not the
 * copy travelling intact, it is what a cleared editor produces: an empty
 * ProseMirror document does not serialise to `""` but to whitespace, and
 * sending that would fail the save on a field the admin never touched.
 */
describe("long description", () => {
  function payloadFor(longDescription: string) {
    const state = validConsumerState();
    state.translations = {
      en: {
        name: "Test Club",
        shortDescription: "A great club",
        longDescription,
      },
    };
    const out = buildCreateInput(state, "consumer_club", consumerConfig);
    return out.translations.find((t) => t.locale === "en");
  }

  it("sends authored markdown through unchanged apart from its outer padding", () => {
    const markdown =
      "# What happens\n\nWe build **redstone** together.\n\n- a headset\n- a mouse";
    expect(payloadFor(`\n${markdown}\n`)?.long_description).toBe(markdown);
  });

  it("folds a cleared editor to null rather than an empty string", () => {
    for (const blank of ["", "   ", "\n", "\n\n  \n"]) {
      expect(
        payloadFor(blank)?.long_description,
        JSON.stringify(blank),
      ).toBeNull();
    }
  });

  it("hydrates the form straight from the stored text, null as blank", () => {
    const markdown = "# Stored\n\nCopy that is already markdown.";
    const withCopy = existingFormState(
      mockDetailRow({
        product_translations: [
          {
            product_id: "prod-1",
            locale: "en",
            name: "Summer Club",
            short_description: "A great club",
            long_description: markdown,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
      }),
      consumerConfig,
      "en",
    );
    expect(withCopy.translations.en?.longDescription).toBe(markdown);

    const withNone = existingFormState(mockDetailRow(), consumerConfig, "en");
    expect(withNone.translations.en?.longDescription).toBe("");
  });
});
