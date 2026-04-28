"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from "@/lib/constants";
import { LOCALE_CONFIG, resolveLocale } from "@/lib/constants/locales";
import {
  useCreateProductV2,
  type CreateProductV2Input,
} from "@/services/products-v2";
import { AudienceSection } from "./sections/audience-section";
import { BillingSection } from "./sections/billing-section";
import { GroupsSection } from "./sections/groups-section";
import { IdentitySection } from "./sections/identity-section";
import { RegistrationSection } from "./sections/registration-section";
import { VisibilitySection } from "./sections/visibility-section";
import { WhenSection } from "./sections/when-section";
import { WhereSection } from "./sections/where-section";
import {
  FIXED_TIMEZONE,
  effectiveBillingMode,
  effectivePricingShape,
  initialState,
  locationPickerMode,
  startModeUsesDate,
  startModeUsesThreshold,
  type FormState,
  type TranslationDraft,
} from "./product-v2-form-state";
import { PRODUCT_TYPE_CONFIG } from "./product-v2-type-config";
import type { SupportedLocale } from "@/lib/constants/locales";
import type { ProductTypeV2 } from "@/types";

interface ProductV2FormProps {
  productType: ProductTypeV2;
}

export function ProductV2Form({ productType }: ProductV2FormProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const router = useRouter();
  const t = useTranslations("admin.productsV2");
  const c = useTranslations("common");
  const rawLocale = useLocale();
  const uiLocale = resolveLocale(rawLocale);
  const label = t(`types.${config.i18nKey}.label`);

  const [state, setState] = useState<FormState>(() =>
    initialState(config, uiLocale),
  );
  const [error, setError] = useState<string | null>(null);

  const createProduct = useCreateProductV2();

  // ===== Validation =====

  // Validate returns a structured failure so submit can not only show the
  // message but also focus the offending input — e.g. switch the pricing
  // block to the currency tab whose price is missing.
  type ValidationFailure = {
    message: string;
    focusCurrency?: SupportedCurrency;
  };

  function validate(): ValidationFailure | null {
    const filledLocales = (
      Object.entries(state.translations) as [SupportedLocale, TranslationDraft][]
    ).filter(([, v]) => v.name.trim() && v.description.trim())
      .map(([k]) => k);

    if (filledLocales.length === 0)
      return { message: t("errors.translationRequired") };
    if (!filledLocales.includes("en") && !filledLocales.includes("fi"))
      return { message: t("errors.translationsMustHaveEnOrFi") };

    // Any locale tab that's been added must be filled in completely — partial
    // entries are almost always user error (added a tab, forgot to type).
    for (const [locale, v] of Object.entries(state.translations) as [
      SupportedLocale,
      TranslationDraft,
    ][]) {
      if (!v.name.trim() || !v.description.trim()) {
        return {
          message: t("errors.translationIncomplete", {
            locale: LOCALE_CONFIG[locale].label,
          }),
        };
      }
    }

    if (!state.topicId) return { message: t("errors.topicRequired") };
    if (!state.spokenLanguageCode)
      return { message: t("errors.spokenLanguageRequired") };

    const minAge = Number(state.minAge);
    const maxAge = Number(state.maxAge);
    if (!Number.isInteger(minAge) || minAge < 0)
      return { message: t("errors.minAgeInvalid") };
    if (!Number.isInteger(maxAge) || maxAge < minAge)
      return { message: t("errors.maxAgeInvalid") };

    const showLocationPicker =
      locationPickerMode(config, state.isRemote) !== null;
    if (showLocationPicker && !state.locationId)
      return {
        message: state.isRemote
          ? t("errors.municipalityRequired")
          : t("errors.siteRequired"),
      };

    if (state.scheduleSlots.length === 0)
      return { message: t("errors.scheduleRequired") };

    if (state.padletUrl.trim()) {
      try {
        new URL(state.padletUrl);
      } catch {
        return { message: t("errors.padletInvalid") };
      }
    }

    const usesDate = startModeUsesDate(state.startMode);
    const usesThreshold = startModeUsesThreshold(state.startMode);
    if (usesDate) {
      if (!state.startDate)
        return { message: t("errors.startDateRequired") };
      if (
        config.scheduleShape !== "single_date" &&
        config.scheduleShape !== "weekly_ongoing" &&
        !state.endDate
      )
        return { message: t("errors.endDateRequired") };
    }
    if (usesThreshold) {
      const thr = Number(state.signupThreshold);
      if (!Number.isInteger(thr) || thr < 1)
        return { message: t("errors.thresholdInvalid") };
    }

    const billingMode = effectiveBillingMode(config, state.paidMode);
    const canUncap =
      config.productType === "event" && billingMode === "free";
    const seatInputDisabled = canUncap && state.uncapped;

    // Seat count required unless explicitly "no limit" on free events.
    if (!seatInputDisabled) {
      const seat = Number(state.seatCount);
      if (!Number.isInteger(seat) || seat < 1)
        return { message: t("errors.seatCountInvalid") };
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
          return {
            message: t("errors.priceSessionMissing", { currency: currencyLabel }),
            focusCurrency: currency,
          };
        const session = Number(sessionTrimmed);
        if (!Number.isFinite(session) || session < 0)
          return {
            message: t("errors.priceSessionNegative", { currency: currencyLabel }),
            focusCurrency: currency,
          };
        if (pricingShape === "session_and_month") {
          const monthTrimmed = row.month.trim();
          if (monthTrimmed === "")
            return {
              message: t("errors.priceMonthMissing", { currency: currencyLabel }),
              focusCurrency: currency,
            };
          const month = Number(monthTrimmed);
          if (!Number.isFinite(month) || month < 0)
            return {
              message: t("errors.priceMonthNegative", { currency: currencyLabel }),
              focusCurrency: currency,
            };
        }
      }
    }

    if (
      state.registrationOpensMode === "scheduled" &&
      !state.registrationOpensDate
    )
      return { message: t("errors.registrationOpensDateRequired") };

    return null;
  }

  // ===== Submit =====

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError.message);
      // Switch the pricing block to the failing currency tab so the admin
      // sees an empty/invalid field where the message says it is.
      if (validationError.focusCurrency) {
        setState((prev) => ({
          ...prev,
          activeCurrency: validationError.focusCurrency!,
        }));
      }
      return;
    }

    const billingMode = effectiveBillingMode(config, state.paidMode);
    const pricingShape = effectivePricingShape(config);
    const usesDate = startModeUsesDate(state.startMode);
    const usesThreshold = startModeUsesThreshold(state.startMode);
    const canUncap =
      config.productType === "event" && billingMode === "free";
    const seatInputDisabled = canUncap && state.uncapped;
    const showPricing =
      billingMode === "paid" && config.pricingShape !== "external";

    const minAge = Number(state.minAge);
    const maxAge = Number(state.maxAge);
    const seat = seatInputDisabled ? null : Number(state.seatCount);

    // For single-date (event), derive weekday from start_date so the
    // schedule_slot row matches the actual event date.
    let finalSlots = state.scheduleSlots;
    if (config.scheduleShape === "single_date" && state.startDate) {
      const dayOfWeek = new Date(state.startDate).getDay();
      // JS Date.getDay() returns 0=Sun..6=Sat; our schema uses 0=Mon..6=Sun.
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

    const input: CreateProductV2Input = {
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
      // Visibility + status move together. RLS `public_read_products_v2`
      // requires both `status IN ('pending', 'running')` AND `is_visible`,
      // so checking "make visible" has to publish the draft to pending at
      // the same time. Admin can roll back to draft from the edit page.
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
      // For paid_upfront, we only collect a single total (per currency); we
      // store it in price_per_session and put 0 in price_per_month. Downstream
      // billing code branches on billing_mode to know which is meaningful.
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

    try {
      await createProduct.mutateAsync(input);
      router.push(`/admin/${config.routeSlug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.createFailed"));
    }
  }

  // ===== Render =====

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <IdentitySection
        state={state}
        setState={setState}
        config={config}
        uiLocale={uiLocale}
        setError={setError}
      />
      <AudienceSection state={state} setState={setState} />
      <WhereSection state={state} setState={setState} config={config} />
      <WhenSection state={state} setState={setState} config={config} />
      <GroupsSection state={state} setState={setState} />
      <BillingSection state={state} setState={setState} config={config} />
      <RegistrationSection state={state} setState={setState} />
      <VisibilitySection state={state} setState={setState} />

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-4 border-t pt-6">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(`/admin/${config.routeSlug}`)}
        >
          {c("cancel")}
        </Button>
        <Button type="submit" size="lg" disabled={createProduct.isPending}>
          {createProduct.isPending && (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          )}
          {t("actions.createLabel", { label: label.toLowerCase() })}
        </Button>
      </div>
    </form>
  );
}
