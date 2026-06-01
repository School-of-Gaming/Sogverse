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
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/lib/constants";
import {
  isSupportedLocale,
  LOCALE_CONFIG,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { decimalToCents } from "@/lib/utils";
import type {
  CreateProductInput,
  ProductAdminDetailRow,
  UpdateProductInput,
} from "@/services/products";
import type { ProductType } from "@/types";
import {
  effectiveBillingMode,
  effectivePricingShape,
  FIXED_TIMEZONE,
  locationPickerMode,
  startModeUsesDate,
  startModeUsesThreshold,
  type FormState,
  type PaidMode,
  type RegistrationOpensMode,
  type TranslationDraft,
} from "./product-form-state";
import type { ProductTypeConfig, StartMode } from "./product-type-config";

// Constrained to the actual keys under `admin.products.errors` so the
// caller's t(`errors.${messageKey}`) typechecks without a cast.
export type ValidationKey =
  | "translationRequired"
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
  /** i18n key under `admin.products.errors`. */
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
  // Translations: at least one filled locale (any locale) and no
  // half-filled tabs. The display fallback chain (preferred → en → first
  // available) means a single locale of any kind is enough to render.
  const entries = Object.entries(state.translations) as [
    SupportedLocale,
    TranslationDraft,
  ][];
  const filledLocales = entries
    .filter(([, v]) => v.name.trim() && v.description.trim())
    .map(([k]) => k);

  if (filledLocales.length === 0) return err("translationRequired");

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
 *   - Prices are stored in *cents*. For upfront_total products we put the
 *     whole total in price_per_session and 0 in price_per_month; downstream
 *     billing branches on billing_mode.
 */
function buildSharedFields(
  state: FormState,
  config: ProductTypeConfig,
): Omit<UpdateProductInput, "image"> {
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
    const weekday = weekdayFromDateString(state.startDate);
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
    billing_mode: billingMode,
    translations,
    topic_id: state.topicId,
    min_age: minAge,
    max_age: maxAge,
    spoken_language_code: state.spokenLanguageCode,
    padlet_url: state.padletUrl.trim() || null,
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
        : state.endDate || null,
    timezone: FIXED_TIMEZONE,
    seat_count: seat,
    waitlist_enabled: state.waitlistEnabled,
    registration_opens_at: resolveRegistrationOpensAt(state),
    is_visible: state.isVisible,
    schedule_slots: finalSlots,
    tag_ids: Array.from(state.tagIds),
    prices: showPricing
      ? SUPPORTED_CURRENCIES.map((currency) => {
          const row = state.prices[currency];
          // `validate()` blocks submit when these are blank/invalid, so the
          // null fallback is unreachable in practice. The shared helper is
          // what the admin preview also uses — display = Stripe charge.
          const sessionCents = decimalToCents(row.session) ?? 0;
          const monthCents =
            pricingShape === "session_and_month"
              ? (decimalToCents(row.month) ?? 0)
              : 0;
          return {
            currency,
            price_per_session: sessionCents,
            price_per_month: monthCents,
          };
        })
      : [],
    holiday_calendar_ids: Array.from(state.holidayCalendarIds),
  };
}

/**
 * Build the request payload for /api/admin/products/create.
 *
 * The form always creates products as `pending` regardless of visibility.
 * `is_visible` is the sole knob the form exposes for "should parents see
 * this?". `draft` is reserved in the schema for a future "save incomplete
 * product" flow — it means *fields are missing*, not *hidden*. See
 * docs/products-architecture.md § "Status vs. visibility".
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
    // Create form's initial state always seeds image as null, so the
    // string variant of FormState.image (used on edit) is unreachable
    // here. Narrow defensively for the typechecker.
    image: state.image instanceof File ? state.image : null,
  };
}

/**
 * Build the request payload for /api/admin/products/[id]/update.
 * Mirrors `buildCreateInput` minus the immutable fields:
 *   - `product_type` is fixed by the URL.
 *   - `status` is preserved by the RPC; effective status re-derives
 *     from the data fields this payload edits.
 *
 * Image passes through as `File | string | null`. The route uses the
 * value to decide what to do with the storage bucket — see comments in
 * `ProductsService.updateProduct`.
 */
export function buildUpdateInput(
  state: FormState,
  config: ProductTypeConfig,
): UpdateProductInput {
  return {
    ...buildSharedFields(state, config),
    image: state.image,
  };
}

// ===== Reverse transform: ProductAdminDetailRow → FormState =====

/** cents → "X.XX" with no trailing-zero stripping (matches form input). */
function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
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
 *   - `manualEdits` is seeded with all 3 currencies. Otherwise editing
 *     the EUR price would FX-overwrite the persisted GBP/USD values that
 *     the admin chose deliberately. Admin clears a cell to opt back into
 *     auto-fill.
 *   - `registrationOpensMode` is derived: in the future ⇒ scheduled (with
 *     the date/hour/minute fields populated from the timestamp in
 *     Helsinki TZ). In the past ⇒ "immediately" (the form will re-resolve
 *     to a fresh now() at submit; harmless because the timestamp is
 *     already in the past).
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
  for (const t of product.product_translations) {
    if (isSupportedLocale(t.locale)) {
      translations[t.locale] = { name: t.name, description: t.description };
    }
  }

  const translationLocales = Object.keys(translations) as SupportedLocale[];
  const activeLocale: SupportedLocale =
    translations[uiLocale] !== undefined
      ? uiLocale
      : translations.en !== undefined
        ? "en"
        : (translationLocales[0] ?? uiLocale);

  // Per-currency record. Rows we don't have stay blank — that's invalid
  // for paid products, but the form's validate() will catch it on save
  // and the read-only details page handles missing rows separately.
  const prices: FormState["prices"] = {
    eur: { session: "", month: "" },
    gbp: { session: "", month: "" },
    usd: { session: "", month: "" },
  };
  for (const row of product.product_prices) {
    const cur = row.currency as SupportedCurrency;
    if (cur in prices) {
      prices[cur] = {
        session: centsToDecimalString(row.price_per_session),
        month: centsToDecimalString(row.price_per_month),
      };
    }
  }

  // Registration mode: future ⇒ scheduled with fields populated; past ⇒
  // immediately (date/hour/minute fall back to defaults — they aren't
  // shown when mode is immediately).
  const opensAt = new Date(product.registration_opens_at);
  const isFuture = opensAt.getTime() > Date.now();
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
    topicId: product.topic_id,
    tagIds: new Set(product.product_tags.map((pt) => pt.tag_id)),
    padletUrl: product.padlet_url ?? "",
    image: product.image_path ?? null,
    showNewTopic: false,
    newTopicName: "",
    newTopicKind: "game",
    showNewTag: false,
    newTagName: "",
    minAge: String(product.min_age),
    maxAge: String(product.max_age),
    spokenLanguageCode: product.spoken_language_code,
    isRemote: product.is_remote,
    locationId: product.location_id,
    startMode: inferStartMode(product, config),
    startDate: product.start_date ?? "",
    endDate: product.end_date ?? "",
    scheduleSlots: product.schedule_slots.map((s) => ({
      weekday: s.weekday,
      start_time: s.start_time,
      duration_minutes: s.duration_minutes,
    })),
    holidayCalendarIds: new Set(
      product.product_holiday_calendars.map((h) => h.calendar_id),
    ),
    signupThreshold:
      product.signup_threshold != null ? String(product.signup_threshold) : "",
    paidMode,
    prices,
    manualEdits: new Set(SUPPORTED_CURRENCIES),
    activeCurrency: DEFAULT_CURRENCY,
    seatCount: product.seat_count != null ? String(product.seat_count) : "",
    uncapped: product.seat_count == null,
    waitlistEnabled: product.waitlist_enabled,
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
 * all copied verbatim) with two deliberate departures:
 *   - `image` is cleared. Cloned products must not share a bucket file —
 *     editing one would clobber the other's image — so the admin picks a
 *     fresh one. Mirrors the legacy clone flow in admin/products/add.
 *   - Each translation's name gets `copySuffix` appended (e.g. " (Copy)"),
 *     localized by the caller, so the clone is distinguishable and the admin
 *     is nudged to rename. The suffix is applied to every locale's name using
 *     the admin's UI-locale string — the active-locale name is what they see.
 *
 * `status` is not represented in FormState; `buildCreateInput` always writes
 * `pending`, so a clone starts pending + (copied) visibility just like any
 * freshly created product.
 */
export function cloneFormState(
  product: ProductAdminDetailRow,
  config: ProductTypeConfig,
  uiLocale: SupportedLocale,
  copySuffix: string,
): FormState {
  const base = existingFormState(product, config, uiLocale);
  const translations: Partial<Record<SupportedLocale, TranslationDraft>> = {};
  for (const [locale, draft] of Object.entries(base.translations) as [
    SupportedLocale,
    TranslationDraft,
  ][]) {
    translations[locale] = { ...draft, name: `${draft.name}${copySuffix}` };
  }
  return { ...base, image: null, translations };
}
