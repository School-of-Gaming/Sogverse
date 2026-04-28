// Pure validation + payload-building logic, lifted out of ProductV2Form so
// it can be unit-tested directly. The form is then a thin shell:
//   const failure = validate(state, config);
//   if (failure) setError(t(failure.messageKey, failure.values));
//   else mutate.mutateAsync(buildCreateInput(state, productType, config));
//
// Validation returns a *key* + interpolation values rather than a translated
// string so this module stays React/next-intl-free. The caller maps the key
// through t() (see product-v2-form.tsx).

import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/constants";
import {
  LOCALE_CONFIG,
  type SupportedLocale,
} from "@/lib/constants/locales";
import type { CreateProductV2Input } from "@/services/products-v2";
import type { ProductTypeV2 } from "@/types";
import {
  effectiveBillingMode,
  effectivePricingShape,
  FIXED_TIMEZONE,
  locationPickerMode,
  startModeUsesDate,
  startModeUsesThreshold,
  type FormState,
  type TranslationDraft,
} from "./product-v2-form-state";
import type { ProductTypeConfig } from "./product-v2-type-config";

// Constrained to the actual keys under `admin.productsV2.errors` so the
// caller's t(`errors.${messageKey}`) typechecks without a cast.
export type ValidationKey =
  | "translationRequired"
  | "translationsMustHaveEnOrFi"
  | "translationIncomplete"
  | "topicRequired"
  | "spokenLanguageRequired"
  | "minAgeInvalid"
  | "maxAgeInvalid"
  | "municipalityRequired"
  | "siteRequired"
  | "scheduleRequired"
  | "padletInvalid"
  | "startDateRequired"
  | "endDateRequired"
  | "thresholdInvalid"
  | "seatCountInvalid"
  | "priceSessionMissing"
  | "priceSessionNegative"
  | "priceMonthMissing"
  | "priceMonthNegative"
  | "registrationOpensDateRequired";

export type ValidationFailure = {
  /** i18n key under `admin.productsV2.errors`. */
  messageKey: ValidationKey;
  /** Interpolation values for t(). */
  values?: Record<string, string | number>;
  /** Currency tab the form should switch to so the bad input is visible. */
  focusCurrency?: SupportedCurrency;
};

function err(
  messageKey: ValidationKey,
  values?: Record<string, string | number>,
  focusCurrency?: SupportedCurrency,
): ValidationFailure {
  return focusCurrency !== undefined
    ? { messageKey, values, focusCurrency }
    : values !== undefined
      ? { messageKey, values }
      : { messageKey };
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
  // Translations: at least one filled locale, at least one of (en, fi),
  // and no half-filled tabs.
  const entries = Object.entries(state.translations) as [
    SupportedLocale,
    TranslationDraft,
  ][];
  const filledLocales = entries
    .filter(([, v]) => v.name.trim() && v.description.trim())
    .map(([k]) => k);

  if (filledLocales.length === 0) return err("translationRequired");
  if (!filledLocales.includes("en") && !filledLocales.includes("fi"))
    return err("translationsMustHaveEnOrFi");

  for (const [locale, v] of entries) {
    if (!v.name.trim() || !v.description.trim()) {
      return err("translationIncomplete", {
        locale: LOCALE_CONFIG[locale].label,
      });
    }
  }

  if (!state.topicId) return err("topicRequired");
  if (!state.spokenLanguageCode) return err("spokenLanguageRequired");

  const minAge = Number(state.minAge);
  const maxAge = Number(state.maxAge);
  if (!Number.isInteger(minAge) || minAge < 0) return err("minAgeInvalid");
  if (!Number.isInteger(maxAge) || maxAge < minAge) return err("maxAgeInvalid");

  const showLocationPicker =
    locationPickerMode(config, state.isRemote) !== null;
  if (showLocationPicker && !state.locationId) {
    return err(state.isRemote ? "municipalityRequired" : "siteRequired");
  }

  if (state.scheduleSlots.length === 0) return err("scheduleRequired");

  if (state.padletUrl.trim()) {
    try {
      new URL(state.padletUrl);
    } catch {
      return err("padletInvalid");
    }
  }

  const usesDate = startModeUsesDate(state.startMode);
  const usesThreshold = startModeUsesThreshold(state.startMode);
  if (usesDate) {
    if (!state.startDate) return err("startDateRequired");
    if (
      config.scheduleShape !== "single_date" &&
      config.scheduleShape !== "weekly_ongoing" &&
      !state.endDate
    ) {
      return err("endDateRequired");
    }
  }
  if (usesThreshold) {
    const thr = Number(state.signupThreshold);
    if (!Number.isInteger(thr) || thr < 1) return err("thresholdInvalid");
  }

  const billingMode = effectiveBillingMode(config, state.paidMode);
  const canUncap = config.productType === "event" && billingMode === "free";
  const seatInputDisabled = canUncap && state.uncapped;

  if (!seatInputDisabled) {
    const seat = Number(state.seatCount);
    if (!Number.isInteger(seat) || seat < 1) return err("seatCountInvalid");
  }

  const showPricing =
    billingMode === "paid" && config.pricingShape !== "external";
  const pricingShape = effectivePricingShape(config);
  if (showPricing) {
    for (const currency of SUPPORTED_CURRENCIES) {
      const row = state.prices[currency];
      const currencyLabel = currency.toUpperCase();

      const sessionTrimmed = row.session.trim();
      if (sessionTrimmed === "")
        return err("priceSessionMissing", { currency: currencyLabel }, currency);
      const session = Number(sessionTrimmed);
      if (!Number.isFinite(session) || session < 0)
        return err("priceSessionNegative", { currency: currencyLabel }, currency);

      if (pricingShape === "session_and_month") {
        const monthTrimmed = row.month.trim();
        if (monthTrimmed === "")
          return err("priceMonthMissing", { currency: currencyLabel }, currency);
        const month = Number(monthTrimmed);
        if (!Number.isFinite(month) || month < 0)
          return err("priceMonthNegative", { currency: currencyLabel }, currency);
      }
    }
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
 * Build the request payload for /api/admin/products-v2/create from the
 * form state. Assumes `validate(state, config)` has already returned null
 * — the function trusts numeric fields parse, locales are filled, etc.
 *
 * Subtle bits worth knowing:
 *   - For single_date events the schedule slot's weekday is *derived* from
 *     start_date, since the dropdown is hidden in the UI. JS Date.getDay()
 *     is 0=Sun..6=Sat; our schema is 0=Mon..6=Sun, hence (d+6)%7.
 *   - end_date for single_date events mirrors start_date so list/detail
 *     code only has to look at end_date for "is it over".
 *   - is_visible toggles drive `status`: visible ⇒ pending (RLS public-read
 *     requires both); hidden ⇒ draft. Edit page can roll either way later.
 *   - Prices are stored in *cents*. For upfront_total products we put the
 *     whole total in price_per_session and 0 in price_per_month; downstream
 *     billing branches on billing_mode.
 */
export function buildCreateInput(
  state: FormState,
  productType: ProductTypeV2,
  config: ProductTypeConfig,
): CreateProductV2Input {
  const billingMode = effectiveBillingMode(config, state.paidMode);
  const pricingShape = effectivePricingShape(config);
  const usesDate = startModeUsesDate(state.startMode);
  const usesThreshold = startModeUsesThreshold(state.startMode);
  const canUncap = config.productType === "event" && billingMode === "free";
  const seatInputDisabled = canUncap && state.uncapped;
  const showPricing =
    billingMode === "paid" && config.pricingShape !== "external";

  const minAge = Number(state.minAge);
  const maxAge = Number(state.maxAge);
  const seat = seatInputDisabled ? null : Number(state.seatCount);

  let finalSlots = state.scheduleSlots;
  if (config.scheduleShape === "single_date" && state.startDate) {
    const dayOfWeek = new Date(state.startDate).getDay();
    const weekday = (dayOfWeek + 6) % 7;
    finalSlots = [{ ...state.scheduleSlots[0], weekday }];
  }

  const translations = (
    Object.entries(state.translations) as [SupportedLocale, TranslationDraft][]
  ).map(([locale, v]) => ({
    locale,
    name: v.name.trim(),
    description: v.description.trim(),
  }));

  return {
    product_type: productType,
    billing_mode: billingMode,
    translations,
    topic_id: state.topicId,
    min_age: minAge,
    max_age: maxAge,
    spoken_language_code: state.spokenLanguageCode,
    padlet_url: state.padletUrl.trim() || null,
    location_id: state.locationId,
    is_remote: state.isRemote,
    status: state.isVisible ? "pending" : "draft",
    signup_threshold:
      usesThreshold && state.signupThreshold
        ? Number(state.signupThreshold)
        : null,
    start_date: usesDate ? state.startDate || null : null,
    end_date: !usesDate
      ? null
      : config.scheduleShape === "single_date"
        ? state.startDate || null
        : state.endDate || null,
    timezone: FIXED_TIMEZONE,
    seat_count: seat,
    waitlist_enabled: state.waitlistEnabled,
    registration_opens_at:
      state.registrationOpensMode === "scheduled" &&
      state.registrationOpensDate
        ? new Date(
            `${state.registrationOpensDate}T${state.registrationOpensHour}:${state.registrationOpensMinute}`,
          ).toISOString()
        : null,
    is_visible: state.isVisible,
    schedule_slots: finalSlots,
    tag_ids: Array.from(state.tagIds),
    prices: showPricing
      ? SUPPORTED_CURRENCIES.map((currency) => {
          const row = state.prices[currency];
          const sessionCents = Math.round(Number(row.session) * 100);
          const monthCents =
            pricingShape === "session_and_month"
              ? Math.round(Number(row.month) * 100)
              : 0;
          return {
            currency,
            price_per_session: sessionCents,
            price_per_month: monthCents,
          };
        })
      : [],
    holiday_calendar_ids: Array.from(state.holidayCalendarIds),
    image: state.image,
  };
}
