// Pure validation + payload-building logic, lifted out of ProductForm so
// it can be unit-tested directly. The form is then a thin shell:
//   const failure = validate(state, config);
//   if (failure) setError(t(failure.messageKey, failure.values));
//   else mutate.mutateAsync(buildCreateInput(state, productType, config));
//
// Validation returns a *key* + interpolation values rather than a translated
// string so this module stays React/next-intl-free. The caller maps the key
// through t() (see product-form.tsx).

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  CURRENCY_CONFIG,
  isSupportedCurrency,
  SUPPORTED_CURRENCIES,
} from "@/lib/constants";
import { completeConsentBundles } from "@/lib/constants/consent-documents";
import {
  ATTACHABLE_MARKETING_CONSENT_TYPES,
  isAttachableMarketingConsent,
} from "@/lib/constants/marketing-consents";
import { isSeededCountry } from "@/lib/constants/location-hierarchies";
import {
  isSupportedLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { resolveWebUrl } from "@/lib/navigation/web-url";
import { decimalToCents } from "@/lib/utils";
import type {
  CreateProductInput,
  ProductAdminDetailRow,
  UpdateProductInput,
} from "@/services/products";
import type { ProductType } from "@/types";
import { formLocksFor } from "./form-locks";
import {
  effectivePricingShape,
  FIXED_TIMEZONE,
  locationPickerMode,
  offersUncapped,
  startModeUsesDate,
  startModeUsesThreshold,
  type FormState,
  type RegistrationOpensMode,
  type TranslationDraft,
} from "./product-form-state";
import { effectiveBillingMode } from "./product-type-config";
import type {
  PaidMode,
  ProductTypeConfig,
  StartMode,
} from "./product-type-config";

// Constrained to the actual keys under `admin.products.errors` so the
// caller's t(`errors.${messageKey}`) typechecks without a cast.
export type ValidationKey =
  | "translationRequired"
  | "translationIncomplete"
  | "topicRequired"
  | "spokenLanguageRequired"
  | "audienceRequired"
  | "minAgeRequired"
  | "maxAgeRequired"
  | "minAgeInvalid"
  | "maxAgeInvalid"
  | "municipalityRequired"
  | "siteRequired"
  | "scheduleRequired"
  | "materialUrlInvalid"
  | "startDateRequired"
  | "endDateRequired"
  | "thresholdInvalid"
  | "seatCountRequired"
  | "seatCountInvalid"
  | "priceSessionMissing"
  | "priceSessionInvalid"
  | "priceMonthMissing"
  | "priceMonthInvalid"
  | "primaryGeduFeeInvalid"
  | "assistantGeduFeeInvalid"
  | "municipalityFeeInvalid"
  | "registrationOpensDateRequired";

export type ValidationFailure = {
  /** i18n key under `admin.products.errors`. */
  messageKey: ValidationKey;
  /** Interpolation values for t(). */
  values?: Record<string, string | number>;
};

function err(
  messageKey: ValidationKey,
  values?: Record<string, string | number>,
): ValidationFailure {
  return values !== undefined ? { messageKey, values } : { messageKey };
}

/**
 * Whether a string is a link we are willing to store and later render as an
 * `href` — parseable **and** on the web. Both fields it guards end up as the
 * `href` of an anchor an admin or a gedu clicks, and nothing legitimate is
 * lost: a lesson-plan drive link is `https://`.
 *
 * The predicate itself is the shared navigation helper, which is where the
 * reasoning for the scheme allow-list lives. One copy, because "may this string
 * become an href" is one question however many surfaces ask it — this form
 * refuses a value on the way *in*, and the family product page runs the same
 * test on the way *out* over a field deliberately stored without validation.
 */
function isWebUrl(value: string): boolean {
  return resolveWebUrl(value) !== null;
}

/**
 * Validate the full form state. Returns the first failure encountered, or
 * `null` if the form can be submitted. Order matches the visual order of
 * the form so the error message points the admin at the section they're
 * looking at.
 */
export function validate(
  state: FormState,
  config: ProductTypeConfig,
): ValidationFailure | null {
  // Translations: at least one filled locale (any locale) and no
  // half-filled tabs. The display fallback chain (preferred → en → first
  // available) means a single locale of any kind is enough to render.
  // Iterate the closed locale union and skip absent tabs — `translations`
  // is a Partial record, so this visits exactly the locales the admin added.
  let hasFilledLocale = false;
  for (const locale of SUPPORTED_LOCALES) {
    const v = state.translations[locale];
    if (v && v.name.trim() && v.shortDescription.trim()) hasFilledLocale = true;
  }

  if (!hasFilledLocale) return err("translationRequired");

  for (const locale of SUPPORTED_LOCALES) {
    const v = state.translations[locale];
    if (!v) continue;
    if (!v.name.trim() || !v.shortDescription.trim()) {
      // The locale *code*, not a display name: this validator is pure and
      // cannot call useLanguageNames — the form resolves the code to the
      // viewer's language name at the t() call site.
      return err("translationIncomplete", { locale });
    }
  }

  if (!state.topic) return err("topicRequired");

  // A product with no audience at all is refused by a CHECK on `products`, and
  // the Audience section makes the state unreachable by refusing to release the
  // last remaining tick. This is the backstop, stated where every other rule
  // about a submittable form is stated rather than living only in a `disabled`
  // attribute one refactor away from disappearing.
  if (!state.forGamers && !state.forParents) return err("audienceRequired");

  // Ages are a property of the gamer audience and of nothing else, so they are
  // required exactly when For gamers is ticked — and not looked at otherwise,
  // since the fields are hidden then and the payload builder sends null whatever
  // they still hold. Emptiness is checked before parsing: `Number("")` is 0, so
  // a blank box would otherwise sail through as a perfectly valid age of zero.
  // A blank field gets its own sentence for the same reason the seat count does
  // — nothing was typed, so nothing is wrong with what was typed.
  if (state.forGamers) {
    if (state.minAge.trim() === "") return err("minAgeRequired");
    if (state.maxAge.trim() === "") return err("maxAgeRequired");
    const minAge = Number(state.minAge);
    const maxAge = Number(state.maxAge);
    if (!Number.isInteger(minAge) || minAge < 0) return err("minAgeInvalid");
    if (!Number.isInteger(maxAge) || maxAge < minAge) {
      return err("maxAgeInvalid");
    }
  }

  if (!state.spokenLanguageCode) return err("spokenLanguageRequired");

  const showLocationPicker =
    locationPickerMode(config, state.isRemote) !== null;
  if (showLocationPicker && !state.locationId) {
    return err(state.isRemote ? "municipalityRequired" : "siteRequired");
  }

  if (state.scheduleSlots.length === 0) return err("scheduleRequired");

  if (state.materialUrl.trim() && !isWebUrl(state.materialUrl)) {
    return err("materialUrlInvalid");
  }

  const usesDate = startModeUsesDate(state.startMode);
  const usesThreshold = startModeUsesThreshold(state.startMode);
  if (usesDate) {
    if (!state.startDate) return err("startDateRequired");
    if (config.scheduleShape === "weekly_ongoing") {
      // Consumer clubs are ongoing by default; only require an end date once
      // the admin has explicitly opted into one (hasEndDate).
      if (state.hasEndDate && !state.endDate) return err("endDateRequired");
    } else if (config.scheduleShape !== "single_date" && !state.endDate) {
      return err("endDateRequired");
    }
  }
  if (usesThreshold) {
    const thr = Number(state.signupThreshold);
    if (!Number.isInteger(thr) || thr < 1) return err("thresholdInvalid");
  }

  const billingMode = effectiveBillingMode(config, state.paidMode);

  // A cap is optional everywhere but municipality clubs, so the count is only
  // validated once the admin is capped — but *once capped it is required*, and
  // a blank box gets its own message. "Seat count must be a positive integer"
  // is the wrong sentence for an empty field: nothing was typed, so nothing is
  // wrong with what was typed. Municipality clubs are always capped (their
  // `uncapped` is pinned false on load), which is what makes a stored uncapped
  // muni row demand a number on its next save.
  if (!state.uncapped) {
    if (state.seatCount.trim() === "") return err("seatCountRequired");
    const seat = Number(state.seatCount);
    if (!Number.isInteger(seat) || seat < 1) return err("seatCountInvalid");
  }

  const showPricing =
    billingMode === "paid" && config.pricingShape !== "external";
  const pricingShape = effectivePricingShape(config);
  if (showPricing) {
    // Each paid type collects a single price: `month` for the consumer-club
    // monthly subscription, `session` for the camp/event upfront total.
    //
    // A price is validated through the exact value the payload will store, and
    // it must reach the currency's minimum charge at Stripe — a lower bound that
    // subsumes the strictly-positive one the fees below hold. A paid product
    // costing nothing is not a price, it is the free billing mode, chosen on the
    // radio rather than typed as a zero; and a price under the minimum is a
    // product the admin can save that no family can buy, since Stripe refuses it
    // at checkout (see `minimumChargeCents` in lib/constants/currency.ts). Both
    // failures share the one message, which names the minimum. A blank box keeps
    // its own sentence: nothing was typed, so nothing is wrong with what was
    // typed.
    const field = pricingShape === "monthly" ? "month" : "session";
    const missingKey =
      pricingShape === "monthly" ? "priceMonthMissing" : "priceSessionMissing";
    const invalidKey =
      pricingShape === "monthly" ? "priceMonthInvalid" : "priceSessionInvalid";
    for (const currency of SUPPORTED_CURRENCIES) {
      const row = state.prices[currency];
      const currencyLabel = currency.toUpperCase();
      const { minimumChargeCents } = CURRENCY_CONFIG[currency];

      const trimmed = row[field].trim();
      if (trimmed === "")
        return err(missingKey, { currency: currencyLabel });
      // The minimum travels as raw *cents*, not as a money string: this module
      // is locale-free, and a formatted amount is a locale decision. The form
      // turns the pair into the viewer's money string at the t() call site, the
      // same shape translationIncomplete's language name uses.
      const cents = decimalToCents(trimmed);
      if (cents == null || cents < minimumChargeCents) {
        return err(invalidKey, {
          currency: currencyLabel,
          minimum: minimumChargeCents,
        });
      }
    }
  }

  // Fees: only the "fee" status collects an amount, and that amount must be a
  // real positive number (0 is the separate "volunteer" status, never a typed
  // "fee" of 0). "unknown"/"none"/"volunteer" need no input. The municipality
  // fee is only validated for municipality clubs (its section is hidden
  // otherwise and the value is forced to null at build time).
  if (
    state.primaryGeduFee.status === "fee" &&
    !positiveAmountValid(state.primaryGeduFee.amount)
  ) {
    return err("primaryGeduFeeInvalid");
  }
  if (
    state.assistantGeduFee.status === "fee" &&
    !positiveAmountValid(state.assistantGeduFee.amount)
  ) {
    return err("assistantGeduFeeInvalid");
  }
  if (
    config.productType === "municipality_club" &&
    state.municipalityFee.status === "fee" &&
    !positiveAmountValid(state.municipalityFee.amount)
  ) {
    return err("municipalityFeeInvalid");
  }

  if (
    state.registrationOpensMode === "scheduled" &&
    !state.registrationOpensDate
  ) {
    return err("registrationOpensDateRequired");
  }

  return null;
}

/**
 * A typed age as a number, or `null` for an empty box — never `Number("")`'s
 * zero, which is a real age the DB would happily store.
 */
function ageOrNull(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

/**
 * A typed fee is valid only as a real positive number of cents — judged through
 * `decimalToCents`, the same conversion the payload stores, so a value that
 * validates and a value that is written can never disagree. Zero is never a
 * typed amount anywhere in this form: for a fee it is the separate "volunteer"
 * status, for a price it is the free billing mode.
 *
 * Prices hold a *higher* bar than this and are checked inline against their
 * currency's minimum charge — a fee is money we pay out of band, so nothing
 * about a payment processor's floor applies to it.
 */
function positiveAmountValid(amount: string): boolean {
  const cents = decimalToCents(amount);
  return cents != null && cents > 0;
}

/**
 * Fold a fee draft (status + decimal amount) into the stored cents value:
 *   "fee"       → the positive amount in cents
 *   "volunteer" → 0
 *   "unknown" | "none" → null
 *
 * A "fee" status with an unparseable amount is unreachable: build only runs
 * after validate() passes, and validate() rejects exactly that case. We assert
 * it rather than silently coercing to 0 — a wrong fee should never be invented
 * from an invalid draft; a thrown error surfaces the broken invariant instead.
 */
function feeDraftToCents(
  status: "unknown" | "none" | "volunteer" | "fee",
  amount: string,
): number | null {
  if (status === "fee") {
    const cents = decimalToCents(amount);
    if (cents == null) {
      throw new Error(
        `feeDraftToCents: "fee" status with an invalid amount (${JSON.stringify(amount)}) — validate() should have blocked this`,
      );
    }
    return cents;
  }
  if (status === "volunteer") return 0;
  return null;
}

/**
 * "Right away" (mode=immediately) resolves to *now*, "Specific time" to the
 * picked Helsinki-local moment. Always returns a real ISO string — every
 * product type has a single ticket-drop concept (`registration_opens_at`
 * is NOT NULL in the schema). `fromZonedTime` interprets the local string
 * as Helsinki time regardless of the admin's browser timezone, so a Tokyo
 * admin and a Helsinki admin produce the same UTC for the same picker
 * input.
 */
function resolveRegistrationOpensAt(state: FormState): string {
  if (
    state.registrationOpensMode === "scheduled" &&
    state.registrationOpensDate
  ) {
    return fromZonedTime(
      `${state.registrationOpensDate}T${state.registrationOpensHour}:${state.registrationOpensMinute}:00`,
      FIXED_TIMEZONE,
    ).toISOString();
  }
  return new Date().toISOString();
}

/**
 * Day of week for a YYYY-MM-DD calendar date, returned in our schema's
 * convention (0=Mon..6=Sun). Independent of browser timezone — the date
 * string is parsed as a calendar date in the local TZ via the (year,
 * month, day) Date constructor, and the resulting day-of-week depends
 * only on the calendar date, not the offset.
 *
 * Naïve `new Date("YYYY-MM-DD").getDay()` interprets the string as UTC
 * midnight and reads getDay() in browser-local time, which is off-by-one
 * for any admin in a timezone west of UTC near the day boundary.
 */
function weekdayFromDateString(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay(); // 0=Sun..6=Sat
  return (dayOfWeek + 6) % 7; // → 0=Mon..6=Sun
}

/**
 * Fields that go into both the create and update payload. Everything the
 * form lets an admin change lives here; create/update wrap with their
 * unique fields (product_type+status / nothing).
 *
 * Assumes `validate(state, config)` returned null — numeric strings parse,
 * locales are filled, prices are present when paid, etc.
 *
 * Subtle bits worth knowing:
 *   - For single_date events the schedule slot's weekday is *derived* from
 *     start_date, since the dropdown is hidden in the UI. See
 *     `weekdayFromDateString` for the TZ caveat.
 *   - end_date for single_date events mirrors start_date so list/detail
 *     code only has to look at end_date for "is it over".
 *   - Prices are stored in *cents* as a single `price_cents` per currency.
 *     For consumer clubs it's the monthly subscription price; for camps/events
 *     the one upfront total. Downstream billing branches on product type to
 *     decide how that amount is charged.
 */
function buildSharedFields(
  state: FormState,
  config: ProductTypeConfig,
): UpdateProductInput {
  const billingMode = effectiveBillingMode(config, state.paidMode);
  const pricingShape = effectivePricingShape(config);
  const usesDate = startModeUsesDate(state.startMode);
  const usesThreshold = startModeUsesThreshold(state.startMode);
  const showPricing =
    billingMode === "paid" && config.pricingShape !== "external";

  // Ages belong to the gamer audience: a product nobody's child can take a seat
  // on carries no range at all rather than a sentinel adult one, and `null` here
  // reaches the RPC as an *omitted* argument, whose DEFAULT NULL writes the SQL
  // NULL the age CHECK demands of a parents-only product.
  //
  // Derived from the audience flag rather than cleared when the checkbox flips —
  // the same shape the waitlist tick below uses, and for the same two reasons: a
  // range the admin typed survives an accidental untick for as long as the form
  // is open, and one gate on the write beats one on every path to it, including
  // a stored row whose ages and audience disagree.
  //
  // `Number("")` is 0, so emptiness is answered before parsing, never after —
  // otherwise a blank box submits as an age of zero. validate() already refuses
  // a blank age on a for-gamers product, so that branch is unreachable from the
  // form; it is written for the value it emits, not for the case it handles.
  const minAge = state.forGamers ? ageOrNull(state.minAge) : null;
  const maxAge = state.forGamers ? ageOrNull(state.maxAge) : null;
  // Uncapped (no seat limit) → null for any product type; otherwise the count.
  //
  // The waitlist is derived from the same answer rather than submitted as the
  // admin last left it. A waitlist is the queue *behind a cap*, so `seat_count
  // null, waitlist_enabled true` is not a configuration — it is a queue with
  // nothing to queue for, and the form can produce one without anybody seeing
  // it: the checkbox renders only while capped, so ticking it and then choosing
  // Unlimited leaves a flag on screen nowhere. Deriving here rather than
  // clearing in the radio handler puts one gate on the write instead of one on
  // each path to it, which also means an already-stranded row (a tick from
  // before this rule, or the column's own default) is corrected by the next
  // save of anything at all. The state flag is deliberately left alone, so an
  // admin toggling Unlimited and back finds their tick still there.
  //
  // What sending `false` here does, server-side: `update_product` DELETES every
  // waitlisted participation on the product (00171), sparing only a row that
  // carries a live subscription. Silently — no confirmation, no email — by
  // owner decision, on the reasoning that the same edit opens seats, so a
  // dropped family can sign up again through the front door. Both branches of
  // this line reach it: unticking the box and choosing Unlimited are one wire
  // shape by the time the RPC sees them.
  const seat = state.uncapped ? null : Number(state.seatCount);
  const waitlist = state.uncapped ? false : state.waitlistEnabled;

  let finalSlots = state.scheduleSlots;
  if (config.scheduleShape === "single_date" && state.startDate) {
    const weekday = weekdayFromDateString(state.startDate);
    finalSlots = [{ ...state.scheduleSlots[0], weekday }];
  }

  const translations: UpdateProductInput["translations"] = [];
  for (const locale of SUPPORTED_LOCALES) {
    const v = state.translations[locale];
    if (!v) continue;
    // A cleared editor does not serialise to "" — an empty ProseMirror document
    // still round-trips through the markdown serialiser as whitespace — so the
    // blank check is on the trimmed value, and a blank one becomes null ("no
    // long description"). Sending "" instead would trip the column's CHECK,
    // which exists precisely so there is one spelling of empty.
    const longDescription = v.longDescription.trim();
    translations.push({
      locale,
      name: v.name.trim(),
      short_description: v.shortDescription.trim(),
      long_description: longDescription === "" ? null : longDescription,
    });
  }

  // validate() guarantees a non-empty topic and language before we ever build a
  // payload; the "" sentinel only exists pre-validation, so reaching either here
  // is a bug.
  const { topic, spokenLanguageCode } = state;
  if (topic === "") {
    throw new Error("buildSharedFields called before validate(): topic is unset");
  }
  if (spokenLanguageCode === "") {
    throw new Error(
      "buildSharedFields called before validate(): spoken language is unset",
    );
  }

  return {
    billing_mode: billingMode,
    translations,
    topic,
    // Round-tripped from state, never defaulted here: on an edit these carry
    // the product's own audience back to an RPC that assigns every editable
    // column, so a hardcoded pair would silently rewrite it.
    for_gamers: state.forGamers,
    for_parents: state.forParents,
    min_age: minAge,
    max_age: maxAge,
    // Round-tripped from state like the audience pair above, and for a sharper
    // version of the same reason: the RPC parameter is DEFAULT NULL, so a tag
    // left out of the payload does not preserve the stored one — it clears it.
    // Sending state's answer on every save, including the `null` that means
    // untagged, is what makes clearing something an admin chose.
    tag: state.tag,
    // Same shape as the tag above — a `DEFAULT NULL` parameter that the RPC
    // assigns on every call, so the answer has to travel on every save, `null`
    // included. Forced to null for a type that offers no lock, so a draft
    // carried across a type change (or a row locked before the flag existed)
    // cannot leave a lock behind a field nobody can see.
    region_lock_country: config.regionLockable ? state.regionLockCountry : null,
    spoken_language_code: spokenLanguageCode,
    // Round-tripped from state on every save, the same shape the audience pair
    // above uses and for the same reason sharpened: `update_product` assigns
    // this column on every call and its parameter defaults to **false**, so an
    // omitted answer would not preserve the flag — it would clear it. Sending
    // state's answer every time, `false` included, is what makes unflagging a
    // product something an admin did rather than something the payload forgot.
    //
    // Not gated by any type config: the obligation comes from a sponsor's
    // contract, and the database has no per-type rule for a gate to mirror.
    requires_gamer_creations: state.requiresGamerCreations,
    // The catalogue entry, on every save including the `null` that means no
    // picture — the route writes the column unconditionally, so an omission
    // and a removal would be the same request. The served path is derived from
    // this id by the database and is never built here.
    image_id: state.imageId,
    material_url: state.materialUrl.trim() || null,
    location_id: state.locationId,
    is_remote: state.isRemote,
    signup_threshold:
      usesThreshold && state.signupThreshold
        ? Number(state.signupThreshold)
        : null,
    start_date: usesDate ? state.startDate || null : null,
    end_date: !usesDate
      ? null
      : config.scheduleShape === "single_date"
        ? state.startDate || null
        : config.scheduleShape === "weekly_ongoing"
          ? // Ongoing unless the admin opted into an end date.
            state.hasEndDate
            ? state.endDate || null
            : null
          : state.endDate || null,
    timezone: FIXED_TIMEZONE,
    seat_count: seat,
    waitlist_enabled: waitlist,
    registration_opens_at: resolveRegistrationOpensAt(state),
    is_visible: state.isVisible,
    schedule_slots: finalSlots,
    prices: showPricing
      ? SUPPORTED_CURRENCIES.map((currency) => {
          const row = state.prices[currency];
          // Consumer clubs charge the monthly price; camps/events the upfront
          // total. Either way it's the single `price_cents`, and it is always
          // strictly positive — a paid product costing nothing is the free
          // billing mode, not a price. validate() rejects exactly that, and
          // build only runs after it passes, so a blank or non-positive amount
          // here is a broken invariant. We assert it rather than coercing to 0:
          // a wrong price should never be invented from an invalid draft.
          const priceCents = decimalToCents(
            pricingShape === "monthly" ? row.month : row.session,
          );
          if (priceCents == null || priceCents <= 0) {
            throw new Error(
              `buildSharedFields called before validate(): ${currency} price is not a positive amount`,
            );
          }
          return {
            currency,
            price_cents: priceCents,
          };
        })
      : [],
    holiday_calendar_ids: Array.from(state.holidayCalendarIds),
    // The enrolment conditions, on every save including the empty array that
    // means "requires nothing" — the RPC replaces the whole set on every call,
    // so an omitted answer would drop a product's conditions rather than
    // preserve them. Not gated by any type config: the mechanism is generic and
    // the database has no per-type rule for it to mirror.
    //
    // Bundles are completed on the way out, so what is written matches what the
    // form showed: a stored half-bundle ticks its row, and a save must not
    // leave the product in a state the form says it is not in.
    required_consent_slugs: completeConsentBundles(
      Array.from(state.requiredConsentSlugs),
    ),
    // The optional marketing asks, on every save including the empty array that
    // means "asks nothing" — the writer replaces the whole set on every call,
    // so an omitted answer would leave a stale ask behind rather than preserve
    // an intended one.
    //
    // In registry order rather than the Set's insertion order, so two admins
    // ticking the same boxes in different orders send the same payload. There
    // is no bundle-completion step here and there never will be: a marketing
    // ask is one consent standing alone, not a document that only makes sense
    // beside another.
    marketing_consent_types: ATTACHABLE_MARKETING_CONSENT_TYPES.filter((type) =>
      state.marketingConsentTypes.has(type),
    ),
    primary_gedu_fee_cents: feeDraftToCents(
      state.primaryGeduFee.status,
      state.primaryGeduFee.amount,
    ),
    assistant_gedu_fee_cents: feeDraftToCents(
      state.assistantGeduFee.status,
      state.assistantGeduFee.amount,
    ),
    // Municipality fee only exists on municipality clubs; force null for every
    // other type so the DB CHECK (chk_products_municipality_fee_only_for_muni)
    // never trips on a stale draft.
    municipality_fee_cents:
      config.productType === "municipality_club"
        ? feeDraftToCents(
            state.municipalityFee.status,
            state.municipalityFee.amount,
          )
        : null,
  };
}

/**
 * Build the request payload for /api/admin/products/create.
 *
 * The form always creates products as `pending` — the first state of the
 * lifecycle, and the only one a product can be created in. `is_visible` is a
 * separate axis and answers a narrower question than its name suggests: it
 * decides whether the product is *listed* on the shop and schools pages, not
 * whether anyone may see or buy it. An unlisted product is reachable, readable
 * and purchasable by direct link, which is what makes it usable for a campaign
 * or an unannounced cohort. See docs/architecture/products.md § "Lifecycle &
 * listing".
 */
export function buildCreateInput(
  state: FormState,
  productType: ProductType,
  config: ProductTypeConfig,
): CreateProductInput {
  return {
    ...buildSharedFields(state, config),
    product_type: productType,
    status: "pending",
  };
}

/**
 * Build the request payload for /api/admin/products/[id]/update.
 * Mirrors `buildCreateInput` minus the immutable fields:
 *   - `product_type` is fixed by the URL.
 *   - `status` is preserved by the RPC; effective status re-derives
 *     from the data fields this payload edits.
 */
export function buildUpdateInput(
  state: FormState,
  config: ProductTypeConfig,
): UpdateProductInput {
  return buildSharedFields(state, config);
}

// ===== Reverse transform: ProductAdminDetailRow → FormState =====

/** cents → "X.XX" with no trailing-zero stripping (matches form input). */
function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
}

// cents → fee draft. Inverse of feeDraftToCents, with the null fallback that
// each fee uses for "not set": gedu/municipality → "unknown", assistant →
// "none". Gedu fees can be 0 (volunteer); the municipality fee can't (CHECK).
function primaryGeduFeeDraft(
  cents: number | null,
): FormState["primaryGeduFee"] {
  if (cents == null) return { status: "unknown", amount: "" };
  if (cents === 0) return { status: "volunteer", amount: "" };
  return { status: "fee", amount: centsToDecimalString(cents) };
}

function assistantGeduFeeDraft(
  cents: number | null,
): FormState["assistantGeduFee"] {
  if (cents == null) return { status: "none", amount: "" };
  if (cents === 0) return { status: "volunteer", amount: "" };
  return { status: "fee", amount: centsToDecimalString(cents) };
}

function municipalityFeeDraft(
  cents: number | null,
): FormState["municipalityFee"] {
  // null = unknown; > 0 = fee. 0 can't occur (the > 0 CHECK rejects it).
  if (cents == null) return { status: "unknown", amount: "" };
  return { status: "fee", amount: centsToDecimalString(cents) };
}

/** Infer the StartMode from the persisted (start_date, signup_threshold) pair. */
function inferStartMode(
  product: ProductAdminDetailRow,
  config: ProductTypeConfig,
): StartMode {
  const hasDate = product.start_date != null;
  const hasThreshold = product.signup_threshold != null;
  let inferred: StartMode;
  if (hasDate && hasThreshold) inferred = "date_and_threshold";
  else if (hasDate) inferred = "date";
  else if (hasThreshold) inferred = "threshold";
  else inferred = config.allowedStartModes[0];

  // Defensive: if the inferred mode isn't in this type's allowedStartModes
  // (shouldn't happen with consistent data but guards against schema drift),
  // fall back to the type's default.
  return config.allowedStartModes.includes(inferred)
    ? inferred
    : config.allowedStartModes[0];
}

/**
 * Map a fetched product (with all child joins) back into FormState so the
 * edit form re-renders the persisted data faithfully. Inverse of
 * `buildCreateInput` / `buildUpdateInput` — the round-trip
 * fetch → existingFormState → buildUpdateInput → RPC should preserve the
 * row's data fields.
 *
 * Decisions baked in:
 *   - `registrationOpensMode` is derived: in the future ⇒ scheduled (with
 *     the date/hour/minute fields populated from the timestamp in
 *     Helsinki TZ). In the past ⇒ "immediately" (the form will re-resolve
 *     to a fresh now() at submit; harmless because the timestamp is
 *     already in the past). A type whose chooser is locked always derives
 *     "immediately" regardless of the stored value — see the comment at the
 *     derivation for why the row does not get a vote there.
 *   - `groups` is empty; the section is UI-only on both create and edit.
 *   - `activeLocale` follows the same fallback chain `resolveTranslation`
 *     uses for display: the admin's UI locale → en → first available. With
 *     ≥1 translation guaranteed by the RPC and trigger, the chain always
 *     resolves to a present row.
 */
export function existingFormState(
  product: ProductAdminDetailRow,
  config: ProductTypeConfig,
  uiLocale: SupportedLocale,
): FormState {
  const translations: Partial<Record<SupportedLocale, TranslationDraft>> = {};
  // Row order, mirroring the Object.keys insertion order this replaced —
  // `translationLocales[0]` is the first *fetched* translation, not the
  // first locale in SUPPORTED_LOCALES order.
  const translationLocales: SupportedLocale[] = [];
  for (const t of product.product_translations) {
    if (isSupportedLocale(t.locale)) {
      translations[t.locale] = {
        name: t.name,
        shortDescription: t.short_description,
        longDescription: t.long_description ?? "",
      };
      translationLocales.push(t.locale);
    }
  }
  const activeLocale: SupportedLocale =
    translations[uiLocale] !== undefined
      ? uiLocale
      : translations.en !== undefined
        ? "en"
        : (translationLocales[0] ?? uiLocale);

  // EUR-only price map. A blank row is invalid for paid products, but
  // validate() catches that on save. Legacy non-EUR `product_prices` rows
  // (from before the EUR-only lockdown) are ignored — `isSupportedCurrency`
  // only admits the eur row.
  //
  // The DB stores one `price_cents`; the form has two input slots
  // (session/month) but only ever uses the one its pricing shape selects.
  // Load the stored amount into that slot and leave the other blank.
  const priceField =
    effectivePricingShape(config) === "monthly" ? "month" : "session";
  const prices: FormState["prices"] = {
    eur: { session: "", month: "" },
  };
  for (const row of product.product_prices) {
    if (isSupportedCurrency(row.currency)) {
      prices[row.currency] = {
        session: "",
        month: "",
        [priceField]: centsToDecimalString(row.price_cents),
      };
    }
  }

  // Registration mode: future ⇒ scheduled with fields populated; past ⇒
  // immediately (date/hour/minute fall back to defaults — they aren't
  // shown when mode is immediately).
  //
  // Unless the type's chooser is locked, in which case the stored timestamp
  // does not get a vote: a locked type has exactly one legal answer, so
  // deriving `scheduled` from the row would render the form in a state the
  // admin cannot leave — both radios disabled, pinned to the option the lock
  // exists to forbid, with the date fields (which are *not* disabled) the only
  // thing they can touch. Locked types can still hold a future drop: rows
  // written before the lock, or during a window when it was lifted (events had
  // one). Forcing `immediately` here means the next save of anything at all
  // normalises the row, the same heal-on-write shape the seat/waitlist pairing
  // uses in `buildSharedFields`.
  const opensAt = new Date(product.registration_opens_at);
  const isFuture =
    opensAt.getTime() > Date.now() && !formLocksFor(config).registrationTiming;
  const mode: RegistrationOpensMode = isFuture ? "scheduled" : "immediately";
  const opensDate = isFuture
    ? formatInTimeZone(opensAt, FIXED_TIMEZONE, "yyyy-MM-dd")
    : "";
  const opensHour = isFuture
    ? formatInTimeZone(opensAt, FIXED_TIMEZONE, "HH")
    : "10";
  const opensMinute = isFuture
    ? formatInTimeZone(opensAt, FIXED_TIMEZONE, "mm")
    : "00";

  const paidMode: PaidMode = product.billing_mode === "free" ? "free" : "paid";

  return {
    translations,
    activeLocale,
    topic: product.topic,
    // Staff-only, so it rides in on its own embedded row rather than on the
    // product itself. No row at all is the ordinary "no lesson link" case.
    materialUrl: product.product_staff_details?.material_url ?? "",
    // The id alone. The picture and its label ride in on the query's
    // `product_images` embed and are handed to the form's image card
    // separately, so nothing about the entry is copied into editable state.
    imageId: product.image_id,
    forGamers: product.for_gamers,
    forParents: product.for_parents,
    // `String(null)` is the string "null", which the payload builder would then
    // parse back to NaN — so an absent age becomes the empty field it is,
    // never a stringified null.
    minAge: product.min_age == null ? "" : String(product.min_age),
    maxAge: product.max_age == null ? "" : String(product.max_age),
    // Straight through: the column is already `ProductTag | null` and the
    // picker's "no tag" option *is* null, so there is nothing to translate.
    tag: product.tag,
    // Nearly straight through — the column is already `string | null` and the
    // picker's "not region locked" option *is* null. The one filter is a stored
    // code the picker cannot offer (a country un-seeded since the lock was set,
    // or one written before this field existed): it loads as *unlocked* rather
    // than as a value with no matching option, because a select whose value
    // matches nothing shows the admin the first option while state holds
    // something else, and the write contract — which only admits seeded
    // countries — would then refuse every save of the product with an error
    // about a field they were never shown. Loading it as null is the same
    // heal-on-write shape the uncapped-muni and locked-registration cases use:
    // the next save of anything at all normalises the row, visibly.
    regionLockCountry: isSeededCountry(product.region_lock_country)
      ? product.region_lock_country
      : null,
    // Straight through: a NOT NULL boolean column and a boolean field, with no
    // empty state between them to translate.
    requiresGamerCreations: product.requires_gamer_creations,
    spokenLanguageCode: product.spoken_language_code,
    isRemote: product.is_remote,
    locationId: product.location_id,
    startMode: inferStartMode(product, config),
    startDate: product.start_date ?? "",
    hasEndDate: product.end_date != null,
    endDate: product.end_date ?? "",
    scheduleSlots: product.schedule_slots.map((s) => ({
      weekday: s.weekday,
      start_time: s.start_time,
      duration_minutes: s.duration_minutes,
    })),
    holidayCalendarIds: new Set(
      product.product_holiday_calendars.map((h) => h.calendar_id),
    ),
    // Straight through from the join table. A stored slug this deploy cannot
    // name is deliberately NOT filtered out the way an un-seeded region lock is
    // — the checkbox renders the raw slug and stays ticked, so a save made for
    // some other reason cannot silently drop a legal condition the product
    // really carries. The write contract admits any string for exactly this
    // reason; the foreign key is what refuses a slug that is not published.
    requiredConsentSlugs: new Set(
      product.product_required_consents.map((c) => c.document_slug),
    ),
    // Straight through from its own join table, and — unlike the requirement
    // set above — a stored type this deploy cannot offer IS dropped here, which
    // is the same asymmetry `describeMarketingConsents` makes on the family
    // side. A required document kept ticked protects a legal condition from a
    // save made for some other reason; a marketing ask has no such condition to
    // protect, and keeping one the form cannot show would leave a checkbox
    // state nobody can see or clear.
    marketingConsentTypes: new Set(
      product.product_marketing_consents
        .map((c) => c.consent_type)
        .filter((type) => isAttachableMarketingConsent(type)),
    ),
    signupThreshold:
      product.signup_threshold != null ? String(product.signup_threshold) : "",
    paidMode,
    prices,
    seatCount: product.seat_count != null ? String(product.seat_count) : "",
    // Municipality clubs have no uncapped option, so a stored `seat_count null`
    // on one loads as capped-with-a-blank-number rather than as a state the
    // form cannot show. Validation then refuses the save until the contracted
    // figure is typed — the heal-on-write the cap requirement is delivered by.
    uncapped: offersUncapped(config) && product.seat_count == null,
    waitlistEnabled: product.waitlist_enabled,
    primaryGeduFee: primaryGeduFeeDraft(product.primary_gedu_fee_cents),
    assistantGeduFee: assistantGeduFeeDraft(product.assistant_gedu_fee_cents),
    municipalityFee: municipalityFeeDraft(product.municipality_fee_cents),
    registrationOpensMode: mode,
    registrationOpensDate: opensDate,
    registrationOpensHour: opensHour,
    registrationOpensMinute: opensMinute,
    isVisible: product.is_visible,
  };
}

/**
 * Map a fetched product into FormState for the *create* form, pre-filled as
 * a clone. Same as `existingFormState` (dates, schedule, prices, visibility
 * all copied verbatim) with one deliberate departure:
 *   - Each translation's name gets `copySuffix` appended (e.g. " (Copy)"),
 *     localized by the caller, so the clone is distinguishable and the admin
 *     is nudged to rename. The suffix is applied to every locale's name using
 *     the admin's UI-locale string — the active-locale name is what they see.
 *
 * `status` is not represented in FormState; `buildCreateInput` always writes
 * `pending`, so a clone starts pending + (copied) visibility just like any
 * freshly created product.
 *
 * **The picture is copied**, along with everything else. It used to be cleared,
 * because a picture was a file one product owned and editing one product's
 * image deleted the other's; a picture is now a catalogue entry any number of
 * products may point at, so sharing one is the ordinary case and a clone that
 * dropped it would just make the admin re-pick what they already had.
 */
export function cloneFormState(
  product: ProductAdminDetailRow,
  config: ProductTypeConfig,
  uiLocale: SupportedLocale,
  copySuffix: string,
): FormState {
  const base = existingFormState(product, config, uiLocale);
  const translations: Partial<Record<SupportedLocale, TranslationDraft>> = {};
  for (const locale of SUPPORTED_LOCALES) {
    const draft = base.translations[locale];
    if (!draft) continue;
    translations[locale] = { ...draft, name: `${draft.name}${copySuffix}` };
  }
  return { ...base, translations };
}
