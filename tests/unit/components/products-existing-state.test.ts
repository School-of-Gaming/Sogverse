import { describe, it, expect } from "vitest";
import {
  buildUpdateInput,
  cloneFormState,
  existingFormState,
} from "@/components/admin/products/product-build";
import {
  initialState,
  sameFormState,
  type FormState,
} from "@/components/admin/products/product-form-state";
import { PRODUCT_TYPE_CONFIG } from "@/components/admin/products/product-type-config";
import { syntheticConsumerProduct } from "../../mocks/product-admin-detail-row";

// Verifies the `existingFormState` reverse transform: a fetched product
// row is mapped back into FormState such that round-tripping it through
// buildUpdateInput re-emits the same values. Catches regressions in
// currency cents↔decimal conversion and the registration-mode (immediate vs
// scheduled) branch.

const consumerConfig = PRODUCT_TYPE_CONFIG.consumer_club;

describe("existingFormState", () => {
  it("seeds field values from the product row", () => {
    const product = syntheticConsumerProduct();
    const state = existingFormState(product, consumerConfig, "en");

    expect(state.translations.drafts).toEqual({
      en: {
        name: "Build Club",
        shortDescription: "Build castles together.",
        longDescription: "",
      },
    });
    expect(state.translations.active).toBe("en");
    expect(state.topic).toBe("minecraft_java");
    expect(state.minAge).toBe("7");
    expect(state.maxAge).toBe("12");
    expect(state.startDate).toBe("2026-09-01");
    expect(state.endDate).toBe("");
    // The stored requirement set, straight through. Unlike the region lock
    // below, a slug the app cannot name is deliberately NOT filtered out —
    // dropping one would let the next save clear a legal condition silently.
    expect(state.requiredConsentSlugs).toEqual(
      new Set(["roblox-programme-terms"]),
    );
    // The optional ask set, off its own join table. Same round trip, opposite
    // filtering rule — see `products-build` for the type this one does drop.
    expect(state.marketingConsentTypes).toEqual(new Set(["lynx_educate"]));
    // The id alone reaches form state; the label and the path stay derived.
    expect(state.imageId).toBe("3d9e4a2f-9c1b-4f6e-8a70-5b2c1d0e7f43");
    expect(state.forGamers).toBe(true);
    expect(state.forParents).toBe(false);
    // Untagged is the fixture's stored state and the picker's default, so the
    // two agree here — the interesting direction is the one below.
    expect(state.tag).toBeNull();
    // Same for the region lock: unlocked stored, unlocked in the picker.
    expect(state.regionLockCountry).toBeNull();
  });

  // The tag is freely editable for the product's whole life (no form lock), so
  // the only thing the edit form has to get right is loading the stored value —
  // and loading it as the enum member it is, never as a string the picker's
  // equality check would miss.
  it("seeds the picker from a tagged row", () => {
    const product = syntheticConsumerProduct();
    product.tag = "advanced";
    expect(existingFormState(product, consumerConfig, "en").tag).toBe(
      "advanced",
    );
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

    expect(state.translations.active).toBe("en");
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

    expect(state.translations.active).toBe("fi");
  });

  it("falls back to the first written in SUPPORTED_LOCALES order, not row order", () => {
    const product = syntheticConsumerProduct();
    product.product_translations = (["fr", "sv"] as const).map((locale) => ({
      product_id: product.id,
      locale,
      name: `Club ${locale}`,
      short_description: "",
      long_description: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    const state = existingFormState(product, consumerConfig, "fi");

    expect(state.translations.active).toBe("sv");
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
    // Travels on every save, empty array included: the RPC replaces the whole
    // requirement set, so an omission would clear it rather than preserve it.
    //
    // The fixture stores half of the Roblox bundle, which is the drift case the
    // bundling has to answer: the form offers the pair as one row and ticks it
    // on either half, so a save writes the whole pair. Completing rather than
    // trimming is the safe direction — the screen said the bundle was required,
    // and no unrelated edit may quietly drop a legal condition.
    expect(input.required_consent_slugs).toEqual([
      "roblox-programme-terms",
      "roblox-privacy-policy",
    ]);
    // The link round-trips on every save, path never on the wire at all.
    expect(input.image_id).toBe("3d9e4a2f-9c1b-4f6e-8a70-5b2c1d0e7f43");
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
    state.translations.drafts = {
      en: {
        name: "Build Club Renamed",
        shortDescription: "Build castles together.",
        longDescription: "",
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

  // Same trap as the audience above, and a worse one: the tag's RPC parameter is
  // DEFAULT NULL, so a stored tag that fails to make the round trip is not left
  // alone — it is cleared, and the shop card silently loses its chip on the next
  // edit of anything at all.
  it("re-emits a stored tag through an unrelated edit", () => {
    const product = syntheticConsumerProduct();
    product.tag = "neuroinclusive";
    const state = existingFormState(product, consumerConfig, "en");
    state.translations.drafts = {
      en: {
        name: "Build Club Renamed",
        shortDescription: "Build castles together.",
        longDescription: "",
      },
    };
    expect(buildUpdateInput(state, consumerConfig).tag).toBe("neuroinclusive");
  });

  it("round-trips an untagged product as an explicit null", () => {
    const product = syntheticConsumerProduct(); // tag: null
    const state = existingFormState(product, consumerConfig, "en");
    const input = buildUpdateInput(state, consumerConfig);

    expect(input).toHaveProperty("tag");
    expect(input.tag).toBeNull();
  });

  // The region lock has the tag's failure mode with a louder consequence: a
  // stored lock that fails the round trip is not left alone, it is *removed*,
  // and the product quietly goes on sale in every country on the next edit of
  // anything at all.
  it("re-emits a stored region lock through an unrelated edit", () => {
    const product = syntheticConsumerProduct();
    product.region_lock_country = "FI";
    const state = existingFormState(product, consumerConfig, "en");
    expect(state.regionLockCountry).toBe("FI");

    state.translations.drafts = {
      en: {
        name: "Build Club Renamed",
        shortDescription: "Build castles together.",
        longDescription: "",
      },
    };
    expect(buildUpdateInput(state, consumerConfig).region_lock_country).toBe(
      "FI",
    );
  });

  it("round-trips an unlocked product as an explicit null", () => {
    const product = syntheticConsumerProduct(); // region_lock_country: null
    const state = existingFormState(product, consumerConfig, "en");
    const input = buildUpdateInput(state, consumerConfig);

    expect(input).toHaveProperty("region_lock_country");
    expect(input.region_lock_country).toBeNull();
  });

  // The creation requirement is the same trap once more, with the flag's own
  // spelling of it: the RPC parameter defaults to FALSE, so a stored `true`
  // that fails the round trip is not left alone — it is cleared, and a
  // sponsored product silently stops owing its contract's creations on the next
  // edit of anything at all.
  it("re-emits a stored creation requirement through an unrelated edit", () => {
    const product = syntheticConsumerProduct();
    product.requires_gamer_creations = true;
    const state = existingFormState(product, consumerConfig, "en");
    expect(state.requiresGamerCreations).toBe(true);

    state.translations.drafts = {
      en: {
        name: "Build Club Renamed",
        shortDescription: "Build castles together.",
        longDescription: "",
      },
    };
    expect(
      buildUpdateInput(state, consumerConfig).requires_gamer_creations,
    ).toBe(true);
  });

  it("round-trips an unflagged product as an explicit false", () => {
    const product = syntheticConsumerProduct(); // requires_gamer_creations: false
    const state = existingFormState(product, consumerConfig, "en");
    const input = buildUpdateInput(state, consumerConfig);

    expect(input).toHaveProperty("requires_gamer_creations");
    expect(input.requires_gamer_creations).toBe(false);
  });

  it("loads a lock on an unseedable country as unlocked", () => {
    // "ES" is a declared but unseeded country: the picker cannot offer it, so a
    // stored lock on one would render as a select whose value matches no option
    // — the admin sees "Not region locked" while state holds something else —
    // and every save would then be refused by a write contract that only admits
    // seeded countries, over a field they were never shown. Loading it as null
    // makes the form honest and lets the next save normalise the row.
    const product = syntheticConsumerProduct();
    product.region_lock_country = "ES";
    const state = existingFormState(product, consumerConfig, "en");

    expect(state.regionLockCountry).toBeNull();
    expect(
      buildUpdateInput(state, consumerConfig).region_lock_country,
    ).toBeNull();
  });
});

/**
 * **Whether the product form holds anything leaving it would lose.** The whole
 * form counts, not only the languages — a guard that ignored a changed price
 * would be worse than none — and the languages are judged by the shared
 * per-locale rule: trimmed, a blank tab ignored, the tab being shown left out.
 */
describe("sameFormState", () => {
  const NO_BODIES = { serialised: new Map<string, string>() };
  const same = (form: FormState, baseline: FormState) =>
    sameFormState(form, baseline, NO_BODIES);
  const opened = () =>
    existingFormState(syntheticConsumerProduct(), consumerConfig, "en");

  it("is the same on open, for an edit, a clone and a new product", () => {
    const edit = opened();
    const clone = cloneFormState(
      syntheticConsumerProduct(),
      consumerConfig,
      "en",
      " (Copy)",
    );
    const fresh = initialState(consumerConfig, "en");
    expect(same(structuredClone(edit), edit)).toBe(true);
    expect(same(structuredClone(clone), clone)).toBe(true);
    expect(same(structuredClone(fresh), fresh)).toBe(true);
  });

  it("differs after a field outside the languages changes, and not after it is put back", () => {
    const baseline = opened();
    const priced: FormState = {
      ...baseline,
      prices: { eur: { ...baseline.prices.eur, month: "50.00" } },
    };
    expect(same(priced, baseline)).toBe(false);
    const putBack: FormState = {
      ...priced,
      prices: { eur: { ...baseline.prices.eur } },
    };
    expect(same(putBack, baseline)).toBe(true);
  });

  it("sees a change inside a set and inside a list", () => {
    const baseline = opened();
    expect(
      same({ ...baseline, requiredConsentSlugs: new Set<string>() }, baseline),
    ).toBe(false);
    expect(
      same(
        {
          ...baseline,
          scheduleSlots: [{ ...baseline.scheduleSlots[0], start_time: "17:00" }],
        },
        baseline,
      ),
    ).toBe(false);
  });

  it("differs after a language edit, and not after it is undone", () => {
    const baseline = opened();
    const en = baseline.translations.drafts.en;
    if (!en) throw new Error("no en draft");
    const renamed: FormState = {
      ...baseline,
      translations: {
        ...baseline.translations,
        drafts: { en: { ...en, name: "Build Club Renamed" } },
      },
    };
    expect(same(renamed, baseline)).toBe(false);
    const undone: FormState = {
      ...renamed,
      translations: { ...renamed.translations, drafts: { en } },
    };
    expect(same(undone, baseline)).toBe(true);
  });

  it("ignores a blank tab, the tab being shown and padding", () => {
    const baseline = opened();
    const en = baseline.translations.drafts.en;
    if (!en) throw new Error("no en draft");
    const touched: FormState = {
      ...baseline,
      translations: {
        active: "fi",
        drafts: {
          en: { ...en, name: `  ${en.name} ` },
          fi: { name: "", shortDescription: " ", longDescription: "\n" },
        },
      },
    };
    expect(same(touched, baseline)).toBe(true);
  });

  it("reads a long description the editor respelled as unchanged", () => {
    const product = syntheticConsumerProduct();
    product.product_translations = product.product_translations.map((row) => ({
      ...row,
      long_description: "* one\n* two",
    }));
    const baseline = existingFormState(product, consumerConfig, "en");
    const en = baseline.translations.drafts.en;
    if (!en) throw new Error("no en draft");
    const respelled: FormState = {
      ...baseline,
      translations: {
        ...baseline.translations,
        drafts: { en: { ...en, longDescription: "- one\n- two\n\n" } },
      },
    };
    const bodies = {
      serialised: new Map([["* one\n* two", "- one\n- two\n\n"]]),
    };
    expect(sameFormState(respelled, baseline, bodies)).toBe(true);
    expect(sameFormState(respelled, baseline, NO_BODIES)).toBe(false);
  });
});
