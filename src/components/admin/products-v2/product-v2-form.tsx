"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  BundlePricePreview,
  SubscriptionPricePreview,
} from "./price-previews";
import { HolidayCalendarOption } from "./holiday-calendar-option";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductImagePicker } from "@/components/admin/product-image-picker";
import { SpokenLanguageRadioGroup } from "@/components/ui/spoken-language-checkboxes";
import { useSpokenLanguages } from "@/services/users";
import { LocationPickerV2 } from "./location-picker-v2";
import {
  useTopicsV2,
  useTagsV2,
  useHolidayCalendarsV2,
  useCreateProductV2,
  useFxRatesFromEur,
  type CreateProductV2Input,
} from "@/services/products-v2";
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_CONFIG,
  DEFAULT_CURRENCY,
  type SupportedCurrency,
} from "@/lib/constants";
import {
  PRODUCT_TYPE_CONFIG,
  type ProductTypeConfig,
  type StartMode,
} from "./product-v2-type-config";
import {
  ScheduleSlotsEditor,
  type ScheduleSlotDraft,
} from "./schedule-slots-editor";
import type { ProductTypeV2 } from "@/types";

const DEFAULT_TIMEZONE = "Europe/Helsinki";

const BILLING_TOGGLE_VALUES: Array<"free" | "paid"> = ["free", "paid"];

const TOPIC_KIND_ORDER: Array<"game" | "subject"> = ["game", "subject"];

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

interface FormState {
  name: string;
  description: string;
  topicId: string;
  tagIds: Set<string>;
  padletUrl: string;
  image: File | null;
  minAge: string;
  maxAge: string;
  spokenLanguageCode: string;
  isRemote: boolean;
  locationId: string | null;
  startMode: StartMode;
  startDate: string;
  endDate: string;
  scheduleSlots: ScheduleSlotDraft[];
  holidayCalendarIds: Set<string>;
  seatCount: string;
  waitlistEnabled: boolean;
  signupThreshold: string;
  billingMode: "paid" | "free" | "external_contract";
  prices: Record<SupportedCurrency, { session: string; month: string }>;
  /**
   * Currencies the admin has landed on at least once. Non-EUR tabs get
   * auto-filled from today's FX rate the first time they're visited with
   * EUR already set — but only once, so switching back doesn't overwrite
   * manual edits.
   */
  fxFilled: Set<SupportedCurrency>;
  activeCurrency: SupportedCurrency;
  refundPolicyDays: string;
  registrationOpensAt: string;
  isVisible: boolean;
}

function initialState(config: ProductTypeConfig): FormState {
  return {
    name: "",
    description: "",
    topicId: "",
    tagIds: new Set(),
    padletUrl: "",
    image: null,
    minAge: "7",
    maxAge: "12",
    spokenLanguageCode: "",
    isRemote: true,
    locationId: null,
    startMode: config.allowedStartModes[0],
    startDate: "",
    endDate: "",
    scheduleSlots:
      config.scheduleShape === "single_date"
        ? [{ weekday: 0, start_time: "17:00", duration_minutes: 60 }]
        : [{ weekday: 2, start_time: "16:00", duration_minutes: 60 }],
    holidayCalendarIds: new Set(),
    seatCount: "10",
    waitlistEnabled: true,
    signupThreshold: "",
    billingMode: config.defaultBillingMode,
    prices: {
      eur: { session: "", month: "" },
      gbp: { session: "", month: "" },
      usd: { session: "", month: "" },
    },
    fxFilled: new Set([DEFAULT_CURRENCY]),
    activeCurrency: DEFAULT_CURRENCY,
    refundPolicyDays: config.hasRefundWindow ? "7" : "",
    registrationOpensAt: "",
    isVisible: false,
  };
}

interface ProductV2FormProps {
  productType: ProductTypeV2;
}

export function ProductV2Form({ productType }: ProductV2FormProps) {
  const config = PRODUCT_TYPE_CONFIG[productType];
  const router = useRouter();
  const t = useTranslations("admin.productsV2");
  const label = t(`types.${config.i18nKey}.label`);

  const [state, setState] = useState<FormState>(() => initialState(config));
  const [error, setError] = useState<string | null>(null);

  const { data: topics } = useTopicsV2();
  const { data: tags } = useTagsV2();
  const { data: calendars } = useHolidayCalendarsV2();
  const { data: spokenLanguages } = useSpokenLanguages();
  const createProduct = useCreateProductV2();

  // For online products we only show a location picker for municipality
  // clubs (they need a jurisdiction anchor). For in-person products we
  // always pick a site.
  const pickerMode: "site" | "jurisdiction" | null = state.isRemote
    ? config.requiresMunicipalityWhenOnline
      ? "jurisdiction"
      : null
    : "site";

  const showLocationPicker = pickerMode !== null;
  const showPrices = state.billingMode === "paid";
  const usesDate =
    state.startMode === "date" || state.startMode === "date_and_threshold";
  const usesThreshold =
    state.startMode === "threshold" ||
    state.startMode === "date_and_threshold";
  const showHolidayCalendars = config.hasHolidayCalendars;
  const showRefund = config.hasRefundWindow && state.billingMode === "paid";
  const allowRemoteToggle = config.allowsRemote && config.allowsInPerson;
  const allowMultipleSlots =
    config.scheduleShape === "weekly_ongoing" ||
    config.scheduleShape === "weekly_bounded" ||
    config.scheduleShape === "multi_day_bounded";

  function validate(): string | null {
    if (!state.name.trim()) return t("errors.nameRequired");
    if (!state.description.trim()) return t("errors.descriptionRequired");
    if (!state.topicId) return t("errors.topicRequired");
    if (!state.spokenLanguageCode) return t("errors.spokenLanguageRequired");
    const minAge = Number(state.minAge);
    const maxAge = Number(state.maxAge);
    if (!Number.isInteger(minAge) || minAge < 0)
      return t("errors.minAgeInvalid");
    if (!Number.isInteger(maxAge) || maxAge < minAge)
      return t("errors.maxAgeInvalid");
    if (showLocationPicker && !state.locationId)
      return state.isRemote
        ? t("errors.municipalityRequired")
        : t("errors.siteRequired");
    if (state.scheduleSlots.length === 0) return t("errors.scheduleRequired");
    if (state.padletUrl.trim()) {
      try {
        new URL(state.padletUrl);
      } catch {
        return t("errors.padletInvalid");
      }
    }
    if (usesDate) {
      // Only bounded/single-date types require start_date in the form even
      // for consumer clubs under "date" or "date_and_threshold" modes,
      // because if the admin picked "date" we expect them to fill it in.
      if (!state.startDate) return t("errors.startDateRequired");
      if (
        config.scheduleShape !== "single_date" &&
        config.scheduleShape !== "weekly_ongoing" &&
        !state.endDate
      )
        return t("errors.endDateRequired");
    }
    if (usesThreshold) {
      const thr = Number(state.signupThreshold);
      if (!Number.isInteger(thr) || thr < 1)
        return t("errors.thresholdInvalid");
    }
    if (state.billingMode !== "free") {
      const seat = Number(state.seatCount);
      if (!Number.isInteger(seat) || seat < 1)
        return t("errors.seatCountInvalid");
    }
    if (showPrices) {
      for (const currency of SUPPORTED_CURRENCIES) {
        const row = state.prices[currency];
        const per = Number(row.session);
        const mon = Number(row.month);
        const currencyLabel = CURRENCY_CONFIG[currency].label;
        if (row.session === "" || !Number.isFinite(per) || per < 0)
          return t("errors.priceSessionInvalid", { currency: currencyLabel });
        if (row.month === "" || !Number.isFinite(mon) || mon < 0)
          return t("errors.priceMonthInvalid", { currency: currencyLabel });
      }
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const minAge = Number(state.minAge);
    const maxAge = Number(state.maxAge);
    const seat =
      state.billingMode === "free" && !state.seatCount
        ? null
        : Number(state.seatCount);

    // For single-date (event), derive weekday from start_date to keep the
    // schedule_slot.weekday consistent with the actual event date.
    let finalSlots = state.scheduleSlots;
    if (config.scheduleShape === "single_date" && state.startDate) {
      const dayOfWeek = new Date(state.startDate).getDay();
      // JS Date.getDay() returns 0=Sun..6=Sat; our schema uses 0=Mon..6=Sun.
      const weekday = (dayOfWeek + 6) % 7;
      finalSlots = [{ ...state.scheduleSlots[0], weekday }];
    }

    const input: CreateProductV2Input = {
      product_type: productType,
      billing_mode: state.billingMode,
      name: state.name.trim(),
      description: state.description.trim(),
      topic_id: state.topicId,
      min_age: minAge,
      max_age: maxAge,
      spoken_language_code: state.spokenLanguageCode,
      padlet_url: state.padletUrl.trim() || null,
      location_id: state.locationId,
      is_remote: state.isRemote,
      // Visibility + status move together. RLS `public_read_products_v2`
      // requires both `status IN ('pending', 'running')` AND `is_visible`, so
      // checking "make visible" has to publish the draft to pending at the
      // same time. Admin can roll back to draft from the edit page later.
      status: state.isVisible ? "pending" : "draft",
      // Start mode gates which of start_date / signup_threshold are sent.
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
      timezone: DEFAULT_TIMEZONE,
      seat_count: seat,
      waitlist_enabled: state.waitlistEnabled,
      registration_opens_at: state.registrationOpensAt
        ? new Date(state.registrationOpensAt).toISOString()
        : null,
      refund_policy_days:
        showRefund && state.refundPolicyDays
          ? Number(state.refundPolicyDays)
          : null,
      is_visible: state.isVisible,
      schedule_slots: finalSlots,
      tag_ids: Array.from(state.tagIds),
      // DB stores integer cents; the form collects decimals for admin UX.
      // One row per supported currency — schema allows blank-currency rows
      // to be omitted but we require all three today (see §4.5 of the doc).
      prices: showPrices
        ? SUPPORTED_CURRENCIES.map((currency) => ({
            currency,
            price_per_session: Math.round(
              Number(state.prices[currency].session) * 100
            ),
            price_per_month: Math.round(
              Number(state.prices[currency].month) * 100
            ),
          }))
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

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Identity */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("sections.identity")}</h2>
        <div className="space-y-2">
          <Label htmlFor="p-name">{t("labels.name")}</Label>
          <Input
            id="p-name"
            maxLength={100}
            value={state.name}
            onChange={(e) => setState({ ...state, name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-description">{t("labels.description")}</Label>
          <textarea
            id="p-description"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={state.description}
            onChange={(e) =>
              setState({ ...state, description: e.target.value })
            }
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-topic">{t("labels.topic")}</Label>
          <select
            id="p-topic"
            className={SELECT_CLASS}
            value={state.topicId}
            onChange={(e) => setState({ ...state, topicId: e.target.value })}
            required
          >
            <option value="">{t("placeholders.selectTopic")}</option>
            {TOPIC_KIND_ORDER.map((kind) => {
              const group = topics?.filter((topic) => topic.kind === kind) ?? [];
              if (group.length === 0) return null;
              return (
                <optgroup key={kind} label={t(`topicKinds.${kind}`)}>
                  {group.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          {topics && topics.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t("hints.noTopics")}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label>{t("labels.tags")}</Label>
          <div className="flex flex-wrap gap-2">
            {tags?.map((tag) => {
              const checked = state.tagIds.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    const next = new Set(state.tagIds);
                    if (checked) next.delete(tag.id);
                    else next.add(tag.id);
                    setState({ ...state, tagIds: next });
                  }}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:bg-accent"
                  }`}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-padlet">{t("labels.padletUrl")}</Label>
          <Input
            id="p-padlet"
            type="url"
            value={state.padletUrl}
            onChange={(e) => setState({ ...state, padletUrl: e.target.value })}
          />
        </div>
        <ProductImagePicker
          value={state.image}
          onChange={(v) =>
            setState({ ...state, image: v instanceof File ? v : null })
          }
        />
      </section>

      {/* Audience */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("sections.audience")}</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="p-min-age">{t("labels.minAge")}</Label>
            <Input
              id="p-min-age"
              type="number"
              min={0}
              value={state.minAge}
              onChange={(e) => setState({ ...state, minAge: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-max-age">{t("labels.maxAge")}</Label>
            <Input
              id="p-max-age"
              type="number"
              min={0}
              value={state.maxAge}
              onChange={(e) => setState({ ...state, maxAge: e.target.value })}
            />
          </div>
        </div>
        {spokenLanguages && (
          <div className="space-y-2">
            <Label>{t("labels.spokenLanguage")}</Label>
            <SpokenLanguageRadioGroup
              spokenLanguages={spokenLanguages}
              selected={state.spokenLanguageCode || null}
              onChange={(v) => setState({ ...state, spokenLanguageCode: v })}
            />
          </div>
        )}
      </section>

      {/* Location */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("sections.location")}</h2>
        {allowRemoteToggle && (
          <div
            className="flex w-fit rounded-md border border-input"
            role="radiogroup"
          >
            {[
              { value: true, label: t("labels.online") },
              { value: false, label: t("labels.inPerson") },
            ].map((opt) => {
              const active = opt.value === state.isRemote;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() =>
                    setState({
                      ...state,
                      isRemote: opt.value,
                      locationId: null,
                    })
                  }
                  className={`px-3 py-1.5 text-sm font-medium first:rounded-l-md last:rounded-r-md ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
        {pickerMode ? (
          <div className="space-y-2">
            <Label>
              {state.isRemote ? t("labels.municipality") : t("labels.site")}
            </Label>
            <LocationPickerV2
              value={state.locationId}
              onChange={(id) => setState({ ...state, locationId: id })}
              pickable={pickerMode}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("hints.onlineNoLocation")}
          </p>
        )}
      </section>

      {/* When */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("sections.when")}</h2>
        {config.allowedStartModes.length > 1 && (
          <div className="space-y-2">
            <Label>{t("startModes.label")}</Label>
            <div className="space-y-2">
              {config.allowedStartModes.map((mode) => {
                const active = state.startMode === mode;
                return (
                  <label
                    key={mode}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-input hover:border-foreground/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="start-mode"
                      checked={active}
                      onChange={() => setState({ ...state, startMode: mode })}
                      className="mt-1 h-4 w-4"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {t(`startModes.${mode}`)}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {t(`startModes.${mode}Description`)}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}
        {usesDate && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="p-start-date">
                {config.scheduleShape === "single_date"
                  ? t("labels.date")
                  : t("labels.startDate")}
              </Label>
              <Input
                id="p-start-date"
                type="date"
                value={state.startDate}
                onChange={(e) =>
                  setState({ ...state, startDate: e.target.value })
                }
              />
            </div>
            {config.scheduleShape !== "single_date" && (
              <div className="space-y-2">
                <Label htmlFor="p-end-date">
                  {config.scheduleShape === "weekly_ongoing"
                    ? t("labels.endDateOptional")
                    : t("labels.endDate")}
                </Label>
                <Input
                  id="p-end-date"
                  type="date"
                  value={state.endDate}
                  onChange={(e) =>
                    setState({ ...state, endDate: e.target.value })
                  }
                />
              </div>
            )}
          </div>
        )}
        {usesThreshold && (
          <div className="space-y-2">
            <Label htmlFor="p-signup-threshold">
              {t("labels.signupThreshold")}
            </Label>
            <Input
              id="p-signup-threshold"
              type="number"
              min={1}
              value={state.signupThreshold}
              onChange={(e) =>
                setState({ ...state, signupThreshold: e.target.value })
              }
            />
          </div>
        )}
        <div className="space-y-2">
          <Label>{t("labels.schedule")}</Label>
          <ScheduleSlotsEditor
            slots={state.scheduleSlots}
            onChange={(slots) => setState({ ...state, scheduleSlots: slots })}
            allowMultiple={allowMultipleSlots}
          />
          {config.scheduleShape === "single_date" && (
            <p className="text-xs text-muted-foreground">
              {t("hints.eventWeekdayDerived")}
            </p>
          )}
        </div>
        {showHolidayCalendars && (
          <div className="space-y-2">
            <Label>{t("labels.holidayCalendars")}</Label>
            <div className="space-y-2">
              {calendars?.map((cal) => {
                const checked = state.holidayCalendarIds.has(cal.id);
                return (
                  <HolidayCalendarOption
                    key={cal.id}
                    calendar={cal}
                    checked={checked}
                    onToggle={() => {
                      const next = new Set(state.holidayCalendarIds);
                      if (checked) next.delete(cal.id);
                      else next.add(cal.id);
                      setState({ ...state, holidayCalendarIds: next });
                    }}
                  />
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("hints.holidaySkips")}
            </p>
          </div>
        )}
      </section>

      {/* Billing */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("sections.billing")}</h2>
        {config.billing.mode === "free_or_paid" && (
          <div className="space-y-2">
            <Label>{t("labels.pricing")}</Label>
            <div
              className="flex w-fit rounded-md border border-input"
              role="radiogroup"
            >
              {BILLING_TOGGLE_VALUES.map((value) => {
                const active = value === state.billingMode;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setState({ ...state, billingMode: value })}
                    className={`px-3 py-1.5 text-sm font-medium first:rounded-l-md last:rounded-r-md ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    }`}
                  >
                    {t(`labels.${value}`)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="p-seat-count">
            {state.billingMode === "free"
              ? t("labels.seatCountOptionalFree")
              : t("labels.seatCount")}
          </Label>
          <Input
            id="p-seat-count"
            type="number"
            min={1}
            value={state.seatCount}
            onChange={(e) => setState({ ...state, seatCount: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.waitlistEnabled}
            onChange={(e) =>
              setState({ ...state, waitlistEnabled: e.target.checked })
            }
          />
          {t("labels.waitlistToggle")}
        </label>
        {showPrices && (
          <PricingBlock state={state} setState={setState} />
        )}
        {showRefund && (
          <div className="space-y-2">
            <Label htmlFor="p-refund-days">{t("labels.refundWindow")}</Label>
            <Input
              id="p-refund-days"
              type="number"
              min={0}
              value={state.refundPolicyDays}
              onChange={(e) =>
                setState({ ...state, refundPolicyDays: e.target.value })
              }
            />
          </div>
        )}
      </section>

      {/* Registration */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("sections.registration")}</h2>
        <div className="space-y-2">
          <Label htmlFor="p-reg-opens">
            {t("labels.registrationOpensAt")}
          </Label>
          <Input
            id="p-reg-opens"
            type="datetime-local"
            value={state.registrationOpensAt}
            onChange={(e) =>
              setState({ ...state, registrationOpensAt: e.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            {t("hints.registrationOpensHint")}
          </p>
        </div>
      </section>

      {/* Visibility — its own prominent section so admins don't miss the
          publish step. */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("sections.visibility")}</h2>
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-md border-2 p-4 transition-colors ${
            state.isVisible
              ? "border-primary bg-primary/5"
              : "border-input hover:bg-accent/50"
          }`}
        >
          <input
            type="checkbox"
            checked={state.isVisible}
            onChange={(e) =>
              setState({ ...state, isVisible: e.target.checked })
            }
            className="mt-0.5 h-5 w-5"
          />
          <div className="space-y-1">
            <div className="text-base font-medium">
              {t("labels.makeVisible")}
            </div>
            <p className="text-sm text-muted-foreground">
              {t("hints.visibleHint")}
            </p>
          </div>
        </label>
      </section>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={createProduct.isPending}
        >
          {t("actions.cancel")}
        </Button>
        <Button type="submit" disabled={createProduct.isPending}>
          {createProduct.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {t("actions.createLabel", { label })}
        </Button>
      </div>
    </form>
  );
}

interface PricingBlockProps {
  state: FormState;
  setState: (s: FormState) => void;
}

function PricingBlock({ state, setState }: PricingBlockProps) {
  const t = useTranslations("admin.productsV2");
  const tPricing = useTranslations("admin.productsV2.pricing");
  const { data: fxRates, isError: fxError } = useFxRatesFromEur(true);

  const active = state.activeCurrency;
  const activeRow = state.prices[active];
  const isEur = active === DEFAULT_CURRENCY;
  const fxRate = fxRates?.[active];
  const eurRow = state.prices[DEFAULT_CURRENCY];

  function switchCurrency(next: SupportedCurrency) {
    // Auto-fill from EUR on first visit to a non-EUR currency when we have
    // a rate and the target is still empty. `fxFilled` guards against
    // overwriting manual edits if the admin tabs back and forth.
    if (next === active) return;
    const already = state.fxFilled.has(next);
    const target = state.prices[next];
    const shouldSuggest =
      next !== DEFAULT_CURRENCY &&
      !already &&
      target.session === "" &&
      target.month === "" &&
      fxRates &&
      (eurRow.session !== "" || eurRow.month !== "");

    if (shouldSuggest) {
      const rate = fxRates[next];
      const suggested = {
        session:
          eurRow.session === ""
            ? ""
            : (Number(eurRow.session) * rate).toFixed(2),
        month:
          eurRow.month === ""
            ? ""
            : (Number(eurRow.month) * rate).toFixed(2),
      };
      const nextFxFilled = new Set(state.fxFilled);
      nextFxFilled.add(next);
      setState({
        ...state,
        activeCurrency: next,
        prices: { ...state.prices, [next]: suggested },
        fxFilled: nextFxFilled,
      });
      return;
    }

    const nextFxFilled = new Set(state.fxFilled);
    nextFxFilled.add(next);
    setState({
      ...state,
      activeCurrency: next,
      fxFilled: nextFxFilled,
    });
  }

  function setField(field: "session" | "month", value: string) {
    setState({
      ...state,
      prices: {
        ...state.prices,
        [active]: { ...activeRow, [field]: value },
      },
    });
  }

  return (
    <div className="space-y-3">
      <div
        className="flex w-fit rounded-md border border-input"
        role="tablist"
        aria-label={tPricing("currencyPickerLabel")}
      >
        {SUPPORTED_CURRENCIES.map((c) => {
          const isActive = c === active;
          return (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => switchCurrency(c)}
              className={`px-3 py-1.5 text-sm font-medium first:rounded-l-md last:rounded-r-md ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              }`}
            >
              {CURRENCY_CONFIG[c].label}
            </button>
          );
        })}
      </div>

      {!isEur && fxError && (
        <p className="text-xs text-muted-foreground">
          {tPricing("fxUnavailable")}
        </p>
      )}
      {!isEur && fxRate !== undefined && (
        <p className="text-xs text-muted-foreground">
          {tPricing("fxSuggested", { rate: fxRate.toFixed(4) })}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="p-price-session">
            {t("labels.pricePerSession")}
          </Label>
          <Input
            id="p-price-session"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={activeRow.session}
            onChange={(e) => setField("session", e.target.value)}
          />
          <BundlePricePreview value={activeRow.session} currency={active} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-price-month">
            {t("labels.pricePerMonth")}
          </Label>
          <Input
            id="p-price-month"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={activeRow.month}
            onChange={(e) => setField("month", e.target.value)}
          />
          <SubscriptionPricePreview value={activeRow.month} currency={active} />
        </div>
      </div>
    </div>
  );
}

