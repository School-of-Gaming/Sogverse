"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Check,
  CircleDollarSign,
  Gift,
  Info,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/lib/constants";
import {
  useCreateProductV2,
  useCreateTagV2,
  useCreateTopicV2,
  useFxRatesFromEur,
  useHolidayCalendarsV2,
  useTagsV2,
  useTopicsV2,
  type CreateProductV2Input,
} from "@/services/products-v2";
import { useSpokenLanguages } from "@/services/users";
import { GeduPickerSheetV2 } from "./gedu-picker-sheet-v2";
import { GroupCard, type GroupDraft } from "./group-card";
import { HolidayCalendarOption } from "./holiday-calendar-option";
import { ImagePickerV2 } from "./image-picker-v2";
import { LocationPickerV2 } from "./location-picker-v2";
import { PricingBlock } from "./pricing-block";
import {
  ScheduleSlotsEditor,
  type ScheduleSlotDraft,
} from "./schedule-slots-editor";
import {
  PRODUCT_TYPE_CONFIG,
  type ProductTypeConfig,
  type StartMode,
} from "./product-v2-type-config";
import type { ProductTypeV2 } from "@/types";

const FIXED_TIMEZONE = "Europe/Helsinki";

// Module-level constants — listed here rather than inline so the lint rule
// against literal strings (i18n) doesn't fire for these structural keys.
const PAID_MODE_VALUES = ["paid", "free"] as const;
const TOPIC_KIND_ORDER = ["game", "subject"] as const;

type PaidMode = (typeof PAID_MODE_VALUES)[number];

// ===== Form state =====

interface FormState {
  // Identity
  name: string;
  description: string;
  topicId: string;
  tagIds: Set<string>;
  padletUrl: string;
  image: File | null;

  // Inline topic create
  showNewTopic: boolean;
  newTopicName: string;
  newTopicKind: "game" | "subject";

  // Inline tag create
  showNewTag: boolean;
  newTagName: string;

  // Audience
  minAge: string;
  maxAge: string;
  spokenLanguageCode: string;

  // Where
  isRemote: boolean;
  locationId: string | null;

  // When
  startMode: StartMode;
  startDate: string;
  endDate: string;
  scheduleSlots: ScheduleSlotDraft[];
  holidayCalendarIds: Set<string>;
  signupThreshold: string;

  // Groups (UI-only — not wired to backend yet)
  groups: GroupDraft[];
  activeGroupSheetId: string | null;

  // Capacity & billing
  paidMode: PaidMode;
  prices: Record<SupportedCurrency, { session: string; month: string }>;
  fxFilled: Set<SupportedCurrency>;
  activeCurrency: SupportedCurrency;
  seatCount: string;
  uncapped: boolean;
  waitlistEnabled: boolean;

  // Registration timing
  registrationOpensAt: string;

  // Visibility
  isVisible: boolean;
}

function defaultSeats(productType: ProductTypeV2): string {
  switch (productType) {
    case "consumer_club":
      return "10";
    case "municipality_club":
      return "12";
    case "camp":
      return "16";
    case "event":
      return "30";
  }
}

function defaultSlots(config: ProductTypeConfig): ScheduleSlotDraft[] {
  if (config.scheduleShape === "multi_day_bounded") {
    return [
      { weekday: 0, start_time: "10:00", duration_minutes: 180 },
      { weekday: 2, start_time: "10:00", duration_minutes: 180 },
      { weekday: 4, start_time: "10:00", duration_minutes: 180 },
    ];
  }
  if (config.scheduleShape === "single_date") {
    return [{ weekday: 0, start_time: "18:00", duration_minutes: 90 }];
  }
  return [{ weekday: 1, start_time: "16:00", duration_minutes: 90 }];
}

function initialState(config: ProductTypeConfig): FormState {
  // Events default to free; everything else has a real billing mode already.
  const initialPaidMode: PaidMode =
    config.billing.mode === "free_or_paid" ? "free" : "paid";
  return {
    name: "",
    description: "",
    topicId: "",
    tagIds: new Set(),
    padletUrl: "",
    image: null,
    showNewTopic: false,
    newTopicName: "",
    newTopicKind: "game",
    showNewTag: false,
    newTagName: "",
    minAge: "7",
    maxAge: "12",
    spokenLanguageCode: "",
    isRemote: true,
    locationId: null,
    startMode: config.allowedStartModes[0],
    startDate: "",
    endDate: "",
    scheduleSlots: defaultSlots(config),
    holidayCalendarIds: new Set(),
    signupThreshold: "",
    groups: [],
    activeGroupSheetId: null,
    paidMode: initialPaidMode,
    prices: {
      eur: { session: "", month: "" },
      gbp: { session: "", month: "" },
      usd: { session: "", month: "" },
    },
    fxFilled: new Set([DEFAULT_CURRENCY]),
    activeCurrency: DEFAULT_CURRENCY,
    seatCount: defaultSeats(config.productType),
    uncapped: false,
    waitlistEnabled: true,
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
  const c = useTranslations("common");
  const label = t(`types.${config.i18nKey}.label`);

  const [state, setState] = useState<FormState>(() => initialState(config));
  const [error, setError] = useState<string | null>(null);

  const { data: topics } = useTopicsV2();
  const { data: tags } = useTagsV2();
  const { data: calendars } = useHolidayCalendarsV2();
  const { data: spokenLanguages } = useSpokenLanguages();
  const createTopic = useCreateTopicV2();
  const createTag = useCreateTagV2();
  const createProduct = useCreateProductV2();
  const fxRatesQuery = useFxRatesFromEur(true);

  // ===== Derived =====

  const effectiveBillingMode: "paid" | "free" | "external_contract" =
    config.billing.mode === "free_or_paid"
      ? state.paidMode === "free"
        ? "free"
        : "paid"
      : config.billing.mode === "external_contract"
        ? "external_contract"
        : "paid";
  const isPaid = effectiveBillingMode === "paid";
  const showPricing = isPaid && config.pricingShape !== "external";
  const pricingShape =
    config.pricingShape === "session_and_month"
      ? "session_and_month"
      : "upfront_total";
  const showExternalInfo = effectiveBillingMode === "external_contract";

  const startTriggerOptions = config.allowedStartModes;
  const usesDate =
    state.startMode === "date" || state.startMode === "date_and_threshold";
  const usesThreshold =
    state.startMode === "threshold" ||
    state.startMode === "date_and_threshold";

  // Free events can have no seat limit; the rest always do.
  const canUncap =
    productType === "event" && effectiveBillingMode === "free";
  const seatInputDisabled = canUncap && state.uncapped;

  // For online products we only show a location picker for municipality
  // clubs (they need a jurisdiction anchor). For in-person products we
  // always pick a site.
  const pickerMode: "site" | "jurisdiction" | null = state.isRemote
    ? config.requiresMunicipalityWhenOnline
      ? "jurisdiction"
      : null
    : "site";

  const showLocationPicker = pickerMode !== null;
  const showHolidayCalendars = config.hasHolidayCalendars;

  // ===== Validation =====

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

    // Seat count required unless explicitly "no limit" on free events.
    if (!seatInputDisabled) {
      const seat = Number(state.seatCount);
      if (!Number.isInteger(seat) || seat < 1)
        return t("errors.seatCountInvalid");
    }

    if (showPricing) {
      for (const currency of SUPPORTED_CURRENCIES) {
        const row = state.prices[currency];
        const session = Number(row.session);
        if (row.session === "" || !Number.isFinite(session) || session < 0)
          return t("errors.priceSessionInvalid", {
            currency: currency.toUpperCase(),
          });
        if (pricingShape === "session_and_month") {
          const month = Number(row.month);
          if (row.month === "" || !Number.isFinite(month) || month < 0)
            return t("errors.priceMonthInvalid", {
              currency: currency.toUpperCase(),
            });
        }
      }
    }

    return null;
  }

  // ===== Submit =====

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

    const input: CreateProductV2Input = {
      product_type: productType,
      billing_mode: effectiveBillingMode,
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
      registration_opens_at: state.registrationOpensAt
        ? new Date(state.registrationOpensAt).toISOString()
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

  // ===== Inline create handlers =====

  async function handleCreateTopic() {
    const name = state.newTopicName.trim();
    if (!name) return;
    setError(null);
    try {
      const created = await createTopic.mutateAsync({
        name,
        kind: state.newTopicKind,
      });
      setState((s) => ({
        ...s,
        topicId: created.id,
        showNewTopic: false,
        newTopicName: "",
        newTopicKind: "game",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.createFailed"));
    }
  }

  async function handleCreateTag() {
    const name = state.newTagName.trim();
    if (!name) return;
    setError(null);
    try {
      const created = await createTag.mutateAsync({ name });
      setState((s) => {
        const next = new Set(s.tagIds);
        next.add(created.id);
        return {
          ...s,
          tagIds: next,
          showNewTag: false,
          newTagName: "",
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.createFailed"));
    }
  }

  // ===== Groups =====

  const activeGroup = state.activeGroupSheetId
    ? state.groups.find((g) => g.id === state.activeGroupSheetId) ?? null
    : null;

  // ===== Render =====

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormSection
        title={t("sections.identity")}
        description={t("sections.identityDescription")}
      >
        <Field label={t("labels.name")} htmlFor="p-name" required>
          <Input
            id="p-name"
            value={state.name}
            placeholder={t(`placeholders.name.${config.i18nKey}`)}
            onChange={(e) => setState({ ...state, name: e.target.value })}
            required
            maxLength={100}
          />
        </Field>

        <Field
          label={t("labels.description")}
          htmlFor="p-description"
          required
        >
          <textarea
            id="p-description"
            placeholder={t(`placeholders.description.${config.i18nKey}`)}
            value={state.description}
            onChange={(e) =>
              setState({ ...state, description: e.target.value })
            }
            rows={3}
            required
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Field>

        <ImagePickerV2
          value={state.image}
          onChange={(v) => setState({ ...state, image: v })}
        />

        <Field
          label={t("labels.topic")}
          htmlFor="p-topic"
          required
          hint={t("hints.topicHint")}
        >
          {state.showNewTopic ? (
            <div className="space-y-2 rounded-md border border-input bg-muted/20 p-3">
              <Input
                placeholder={t("placeholders.newTopicName")}
                value={state.newTopicName}
                onChange={(e) =>
                  setState({ ...state, newTopicName: e.target.value })
                }
                autoFocus
                disabled={createTopic.isPending}
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("labels.groupTopicUnder")}
                </span>
                {TOPIC_KIND_ORDER.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() =>
                      setState({ ...state, newTopicKind: kind })
                    }
                    disabled={createTopic.isPending}
                    className={cn(
                      "rounded-md border px-3 py-1 text-xs transition-colors",
                      state.newTopicKind === kind
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input text-muted-foreground hover:border-foreground hover:text-foreground"
                    )}
                  >
                    {t(`topicKindSingular.${kind}`)}
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={createTopic.isPending}
                  onClick={() =>
                    setState({
                      ...state,
                      newTopicName: "",
                      showNewTopic: false,
                    })
                  }
                >
                  {c("cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!state.newTopicName.trim() || createTopic.isPending}
                  onClick={handleCreateTopic}
                >
                  {createTopic.isPending && (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  )}
                  {t("actions.addTopic")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <select
                id="p-topic"
                value={state.topicId}
                onChange={(e) =>
                  setState({ ...state, topicId: e.target.value })
                }
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setState({ ...state, showNewTopic: true })}
                title={t("actions.addNewTopic")}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </Field>

        <Field label={t("labels.tags")} hint={t("hints.tagsHint")}>
          <div className="flex flex-wrap items-center gap-2">
            {tags?.map((tag) => {
              const selected = state.tagIds.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    const next = new Set(state.tagIds);
                    if (selected) next.delete(tag.id);
                    else next.add(tag.id);
                    setState({ ...state, tagIds: next });
                  }}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input text-muted-foreground hover:border-foreground hover:text-foreground"
                  )}
                  title={tag.description ?? undefined}
                >
                  {selected && <Check className="mr-1 inline h-3 w-3" />}
                  {tag.name}
                </button>
              );
            })}

            {state.showNewTag ? (
              <span className="inline-flex items-center gap-1">
                <Input
                  value={state.newTagName}
                  onChange={(e) =>
                    setState({ ...state, newTagName: e.target.value })
                  }
                  placeholder={t("placeholders.newTagName")}
                  autoFocus
                  className="h-7 w-40 text-xs"
                  disabled={createTag.isPending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleCreateTag();
                    }
                    if (e.key === "Escape") {
                      setState({ ...state, newTagName: "", showNewTag: false });
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={!state.newTagName.trim() || createTag.isPending}
                  onClick={handleCreateTag}
                >
                  {createTag.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    t("actions.addTagShort")
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() =>
                    setState({ ...state, newTagName: "", showNewTag: false })
                  }
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label={c("cancel")}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setState({ ...state, showNewTag: true })}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-input px-3 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                {t("actions.addNewTag")}
              </button>
            )}
          </div>
        </Field>

        <Field
          label={t("labels.padletUrl")}
          htmlFor="p-padlet"
          hint={t("hints.padletHint")}
        >
          <Input
            id="p-padlet"
            type="url"
            placeholder={t("placeholders.padletUrl")}
            value={state.padletUrl}
            onChange={(e) => setState({ ...state, padletUrl: e.target.value })}
          />
        </Field>
      </FormSection>

      <FormSection
        title={t("sections.audience")}
        description={t("sections.audienceDescription")}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("labels.minAge")} htmlFor="p-min-age" required>
            <Input
              id="p-min-age"
              type="number"
              min={0}
              value={state.minAge}
              onChange={(e) => setState({ ...state, minAge: e.target.value })}
              required
            />
          </Field>
          <Field label={t("labels.maxAge")} htmlFor="p-max-age" required>
            <Input
              id="p-max-age"
              type="number"
              min={0}
              value={state.maxAge}
              onChange={(e) => setState({ ...state, maxAge: e.target.value })}
              required
            />
          </Field>
        </div>

        {spokenLanguages && (
          <Field
            label={t("labels.deliveredIn")}
            hint={t("hints.deliveredInHint")}
          >
            <div className="flex flex-wrap gap-2">
              {spokenLanguages.map((lang) => (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() =>
                    setState({ ...state, spokenLanguageCode: lang.code })
                  }
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm transition-colors",
                    state.spokenLanguageCode === lang.code
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input text-muted-foreground hover:border-foreground hover:text-foreground"
                  )}
                >
                  {lang.name}
                </button>
              ))}
            </div>
          </Field>
        )}
      </FormSection>

      <FormSection
        title={t("sections.where")}
        description={t(`sections.whereDescription.${config.i18nKey}`)}
      >
        {config.allowsRemote && config.allowsInPerson ? (
          <div className="inline-flex rounded-md border border-input p-1">
            <button
              type="button"
              onClick={() => setState({ ...state, isRemote: true })}
              className={cn(
                "rounded px-4 py-1.5 text-sm transition-colors",
                state.isRemote
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t("labels.online")}
            </button>
            <button
              type="button"
              onClick={() => setState({ ...state, isRemote: false })}
              className={cn(
                "rounded px-4 py-1.5 text-sm transition-colors",
                !state.isRemote
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t("labels.inPerson")}
            </button>
          </div>
        ) : null}

        <div className="mt-3 space-y-4">
          {showLocationPicker ? (
            <Field
              label={
                state.isRemote
                  ? t("labels.municipality")
                  : t("labels.site")
              }
              required
              hint={
                state.isRemote
                  ? t("hints.municipalityHint")
                  : t("hints.siteHint")
              }
            >
              <LocationPickerV2
                value={state.locationId}
                onChange={(id) => setState({ ...state, locationId: id })}
                pickable={pickerMode}
              />
            </Field>
          ) : (
            <InfoCallout text={t("hints.onlineNoLocation")} />
          )}

          {state.isRemote && (
            <InfoCallout text={t("hints.voiceRoomAuto")} />
          )}
        </div>
      </FormSection>

      <FormSection
        title={t("sections.when")}
        description={t(`sections.whenDescription.${config.i18nKey}`)}
      >
        {startTriggerOptions.length > 1 && (
          <Field label={t("startModes.label")}>
            <div className="space-y-2">
              {startTriggerOptions.map((option) => (
                <label
                  key={option}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors",
                    state.startMode === option
                      ? "border-primary bg-primary/5"
                      : "border-input hover:border-foreground/30"
                  )}
                >
                  <input
                    type="radio"
                    name="startTrigger"
                    checked={state.startMode === option}
                    onChange={() =>
                      setState({
                        ...state,
                        startMode: option,
                        signupThreshold:
                          option === "date" ? "" : state.signupThreshold,
                        startDate:
                          option === "threshold" ? "" : state.startDate,
                        endDate: option === "threshold" ? "" : state.endDate,
                      })
                    }
                    className="mt-1 h-4 w-4"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {t(`startModes.${option}`)}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {t(`startModes.${option}Description`)}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </Field>
        )}

        {usesDate && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label={
                productType === "event"
                  ? t("labels.eventDate")
                  : t("labels.startDate")
              }
              htmlFor="p-start-date"
              required
            >
              <Input
                id="p-start-date"
                type="date"
                value={state.startDate}
                onChange={(e) =>
                  setState({ ...state, startDate: e.target.value })
                }
                required
              />
            </Field>
            {productType === "event" ? (
              <div className="flex items-end text-xs text-muted-foreground">
                <Info className="mr-1.5 inline h-3.5 w-3.5" />
                {t("hints.eventSingleDay")}
              </div>
            ) : (
              <Field
                label={
                  productType === "consumer_club"
                    ? t("labels.endDateOptional")
                    : productType === "municipality_club"
                      ? t("labels.seasonEndDate")
                      : t("labels.endDate")
                }
                htmlFor="p-end-date"
                hint={
                  productType === "consumer_club"
                    ? t("hints.endDateOpt")
                    : undefined
                }
                required={productType !== "consumer_club"}
              >
                <Input
                  id="p-end-date"
                  type="date"
                  value={state.endDate}
                  onChange={(e) =>
                    setState({ ...state, endDate: e.target.value })
                  }
                  required={productType !== "consumer_club"}
                />
              </Field>
            )}
          </div>
        )}

        {usesThreshold && (
          <Field
            label={t("labels.signupThreshold")}
            htmlFor="p-threshold"
            required
            hint={
              state.startMode === "threshold"
                ? t("hints.thresholdOnly")
                : t("hints.thresholdWithDate")
            }
          >
            <Input
              id="p-threshold"
              type="number"
              min="1"
              placeholder={t("placeholders.threshold")}
              value={state.signupThreshold}
              onChange={(e) =>
                setState({ ...state, signupThreshold: e.target.value })
              }
              className="max-w-[220px]"
              required
            />
          </Field>
        )}

        <InfoCallout text={t("hints.timezoneFixedHelsinki")} />

        <div className="space-y-2">
          <Label>
            {productType === "camp"
              ? t("labels.daysAndTimes")
              : productType === "event"
                ? t("labels.time")
                : t("labels.dayAndTime")}
          </Label>
          <ScheduleSlotsEditor
            productType={productType}
            slots={state.scheduleSlots}
            onChange={(slots) =>
              setState({ ...state, scheduleSlots: slots })
            }
          />
        </div>

        {showHolidayCalendars && (
          <Field
            label={t("labels.holidayCalendars")}
            hint={t("hints.holidayHint")}
          >
            <div className="space-y-2">
              {calendars?.map((cal) => (
                <HolidayCalendarOption
                  key={cal.id}
                  calendar={cal}
                  checked={state.holidayCalendarIds.has(cal.id)}
                  onToggle={() => {
                    const next = new Set(state.holidayCalendarIds);
                    if (next.has(cal.id)) next.delete(cal.id);
                    else next.add(cal.id);
                    setState({ ...state, holidayCalendarIds: next });
                  }}
                />
              ))}
            </div>
          </Field>
        )}
      </FormSection>

      <FormSection
        title={t("sections.groups")}
        description={t("sections.groupsDescription")}
      >
        <InfoCallout text={t("hints.groupsHint")} />

        <InfoCallout text={t("hints.groupsNotWired")} variant="warn" />

        {state.groups.length === 0 ? (
          <div className="rounded-md border border-dashed border-input px-4 py-6 text-center">
            <p className="text-sm font-medium">{t("groups.noGroupsYet")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("groups.noGroupsDetail")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {state.groups.map((group, i) => (
              <GroupCard
                key={group.id}
                group={group}
                index={i}
                onNameChange={(name) =>
                  setState({
                    ...state,
                    groups: state.groups.map((g) =>
                      g.id === group.id ? { ...g, name } : g
                    ),
                  })
                }
                onRemoveGedu={(geduId) =>
                  setState({
                    ...state,
                    groups: state.groups.map((g) =>
                      g.id === group.id
                        ? {
                            ...g,
                            geduIds: g.geduIds.filter((id) => id !== geduId),
                          }
                        : g
                    ),
                  })
                }
                onAddGedu={() =>
                  setState({ ...state, activeGroupSheetId: group.id })
                }
                onRemove={() =>
                  setState({
                    ...state,
                    groups: state.groups.filter((g) => g.id !== group.id),
                  })
                }
              />
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const letter = String.fromCharCode(65 + state.groups.length);
            setState({
              ...state,
              groups: [
                ...state.groups,
                {
                  id: `g-${Date.now()}-${state.groups.length}`,
                  name: t("groups.defaultName", { letter }),
                  geduIds: [],
                },
              ],
            });
          }}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          {t("groups.addGroup")}
        </Button>

        {/* Only mount the picker while it's open. Sheet uses createPortal
            against document.body, which crashes during SSR — and conditional
            mounting matches the convention in src/components/admin/group-card.tsx
            (line 272) for the same reason. */}
        {activeGroup && (
          <GeduPickerSheetV2
            open
            onOpenChange={(open) => {
              if (!open) setState({ ...state, activeGroupSheetId: null });
            }}
            title={t("groups.addGeduTo", { name: activeGroup.name })}
            description={t("groups.addGeduDescription")}
            excludeIds={activeGroup.geduIds}
            onSelect={(geduId) => {
              setState({
                ...state,
                groups: state.groups.map((g) =>
                  g.id === activeGroup.id
                    ? { ...g, geduIds: [...g.geduIds, geduId] }
                    : g
                ),
              });
            }}
          />
        )}
      </FormSection>

      <FormSection
        title={t("sections.billing")}
        description={t(`sections.billingDescription.${config.i18nKey}`)}
      >
        {config.billing.mode === "free_or_paid" && (
          <Field
            label={t("labels.billing")}
            hint={t("hints.billingHint")}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {PAID_MODE_VALUES.map((mode) => {
                const active = state.paidMode === mode;
                const Icon = mode === "free" ? Gift : CircleDollarSign;
                return (
                  <label
                    key={mode}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                      active
                        ? "border-primary bg-primary/5"
                        : "border-input hover:border-foreground/30"
                    )}
                  >
                    <input
                      type="radio"
                      name="paidMode"
                      checked={active}
                      onChange={() =>
                        setState({ ...state, paidMode: mode })
                      }
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Icon className="h-4 w-4 text-primary" />
                        {t(`labels.${mode}`)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t(`hints.${mode}Detail`)}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </Field>
        )}

        {showExternalInfo && (
          <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="font-medium">{t("labels.paidByMunicipality")}</div>
              <div className="text-xs text-muted-foreground">
                {t("hints.paidByMunicipality")}
              </div>
            </div>
          </div>
        )}

        {showPricing && (
          <Field
            label={t("labels.pricing")}
            hint={
              pricingShape === "session_and_month"
                ? t("hints.pricingPerSession")
                : t("hints.pricingUpfront")
            }
          >
            <PricingBlock
              shape={pricingShape}
              state={{
                prices: state.prices,
                fxFilled: state.fxFilled,
                activeCurrency: state.activeCurrency,
              }}
              onChange={(next) => setState({ ...state, ...next })}
              fxRates={fxRatesQuery.data}
            />
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("labels.seatCount")}
            htmlFor="p-seat"
            required={!seatInputDisabled}
            hint={
              canUncap
                ? t("hints.seatCanUncap")
                : t("hints.seatHint")
            }
          >
            <Input
              id="p-seat"
              type="number"
              min="1"
              value={seatInputDisabled ? "" : state.seatCount}
              onChange={(e) =>
                setState({ ...state, seatCount: e.target.value })
              }
              disabled={seatInputDisabled}
              placeholder={
                seatInputDisabled ? t("placeholders.noLimit") : undefined
              }
              required={!seatInputDisabled}
            />
          </Field>

          {canUncap && (
            <div className="flex items-end pb-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={state.uncapped}
                  onChange={(e) =>
                    setState({ ...state, uncapped: e.target.checked })
                  }
                  className="h-4 w-4"
                />
                <span>{t("labels.noSeatLimit")}</span>
              </label>
            </div>
          )}
        </div>

        {!seatInputDisabled && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={state.waitlistEnabled}
              onChange={(e) =>
                setState({ ...state, waitlistEnabled: e.target.checked })
              }
              className="h-4 w-4"
            />
            <span>{t("labels.waitlistToggle")}</span>
          </label>
        )}
      </FormSection>

      <FormSection
        title={t("sections.registration")}
        description={t("sections.registrationDescription")}
      >
        <Field
          label={t("labels.registrationOpensAt")}
          htmlFor="p-opens-at"
          hint={t("hints.registrationOpensHint")}
        >
          <Input
            id="p-opens-at"
            type="datetime-local"
            value={state.registrationOpensAt}
            onChange={(e) =>
              setState({ ...state, registrationOpensAt: e.target.value })
            }
          />
        </Field>
      </FormSection>

      <FormSection
        title={t("sections.visibility")}
        description={t("sections.visibilityDescription")}
      >
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-input p-3">
          <input
            type="checkbox"
            checked={state.isVisible}
            onChange={(e) =>
              setState({ ...state, isVisible: e.target.checked })
            }
            className="mt-0.5 h-4 w-4"
          />
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-medium">{t("labels.makeVisible")}</div>
            <div className="text-xs text-muted-foreground">
              {t("hints.visibleHint")}
            </div>
          </div>
        </label>
      </FormSection>

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

// ===== Reusable layout primitives =====

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <div className="space-y-4">{children}</div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function InfoCallout({
  text,
  variant = "info",
}: {
  text: string;
  variant?: "info" | "warn";
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-xs",
        variant === "info"
          ? "border-border bg-muted/30 text-muted-foreground"
          : "border-primary/40 bg-primary/5 text-foreground"
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  );
}
