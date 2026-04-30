"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrencyFromCents } from "@/lib/utils";
import type { SupportedCurrency } from "@/lib/constants/currency";
import type { SubscriptionFrequency } from "@/lib/constants/pricing";
import type { PricingOption, PricingTracks } from "./pricing-options";

// Two-track stacked list: Subscribe rows on top, Pay-as-you-go below.
// Pure presentational — takes the resolved tracks and a selected key,
// emits onSelect with the new key.
//
// On consumer clubs we render both tracks. On every other type the
// `single` slot is what we render — one row, no picker. The shape stays
// uniform so the surrounding signup panel doesn't need to switch on
// product type.

interface PricingPanelViewProps {
  tracks: PricingTracks;
  selectedKey: PricingOption["key"];
  onSelect: (key: PricingOption["key"]) => void;
  currency: SupportedCurrency;
  locale: string;
}

export function PricingPanelView({
  tracks,
  selectedKey,
  onSelect,
  currency,
  locale,
}: PricingPanelViewProps) {
  const t = useTranslations("productDetail.pricing");

  if (tracks.single) {
    return <SingleRow option={tracks.single} currency={currency} locale={locale} />;
  }

  return (
    <div className="space-y-3">
      {tracks.subscriptions.length > 0 && (
        <Track heading={t("subscribeHeading")}>
          {tracks.subscriptions.map((opt) => (
            <SubscriptionRow
              key={opt.key}
              option={opt}
              selected={selectedKey === opt.key}
              onSelect={() => onSelect(opt.key)}
              currency={currency}
              locale={locale}
            />
          ))}
        </Track>
      )}
      {tracks.bundles.length > 0 && (
        <Track heading={t("bundleHeading")}>
          {tracks.bundles.map((opt) => (
            <BundleRow
              key={opt.key}
              option={opt}
              selected={selectedKey === opt.key}
              onSelect={() => onSelect(opt.key)}
              currency={currency}
              locale={locale}
            />
          ))}
        </Track>
      )}
    </div>
  );
}

function Track({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {heading}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function RowShell({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
        selected
          ? "border-primary bg-primary/10"
          : "border-input hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SubscriptionRow({
  option,
  selected,
  onSelect,
  currency,
  locale,
}: {
  option: Extract<PricingOption, { kind: "subscription" }>;
  selected: boolean;
  onSelect: () => void;
  currency: SupportedCurrency;
  locale: string;
}) {
  const t = useTranslations("productDetail.pricing");
  return (
    <RowShell selected={selected} onSelect={onSelect}>
      <span className="flex min-w-0 flex-col">
        <span className="font-medium">{frequencyLabel(option.frequency, t)}</span>
        {option.savingsPercent > 0 && (
          <span className="text-xs text-muted-foreground">
            {t("savings", { percent: option.savingsPercent })}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold tabular-nums">
          {formatCurrencyFromCents(option.totalCents, currency, locale)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {cadenceShort(option.frequency, t)}
          </span>
        </span>
        <SelectedDot selected={selected} />
      </span>
    </RowShell>
  );
}

function BundleRow({
  option,
  selected,
  onSelect,
  currency,
  locale,
}: {
  option: Extract<PricingOption, { kind: "bundle" }>;
  selected: boolean;
  onSelect: () => void;
  currency: SupportedCurrency;
  locale: string;
}) {
  const t = useTranslations("productDetail.pricing");
  const label =
    option.bundleSize === 1
      ? t("bundleSingle")
      : t("bundleN", { count: option.bundleSize });
  return (
    <RowShell selected={selected} onSelect={onSelect}>
      <span className="flex min-w-0 flex-col">
        <span className="font-medium">{label}</span>
        {option.savingsPercent > 0 && (
          <span className="text-xs text-muted-foreground">
            {t("savings", { percent: option.savingsPercent })}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold tabular-nums">
          {formatCurrencyFromCents(option.totalCents, currency, locale)}
        </span>
        <SelectedDot selected={selected} />
      </span>
    </RowShell>
  );
}

function SelectedDot({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-input",
      )}
      aria-hidden
    >
      {selected && <Check className="h-3 w-3" />}
    </span>
  );
}

function SingleRow({
  option,
  currency,
  locale,
}: {
  option: Extract<
    PricingOption,
    { kind: "free" | "external" | "upfront" | "unavailable" }
  >;
  currency: SupportedCurrency;
  locale: string;
}) {
  const t = useTranslations("productDetail.pricing");
  switch (option.kind) {
    case "free":
      return (
        <div className="rounded-md border border-border p-3">
          <p className="text-base font-bold">{t("free")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("freeHint")}</p>
        </div>
      );
    case "external":
      return (
        <div className="rounded-md border border-border p-3">
          <p className="text-base font-bold">{t("external")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("externalHint")}</p>
        </div>
      );
    case "upfront":
      return (
        <div className="rounded-md border border-border p-3">
          <p className="text-base font-bold tabular-nums">
            {formatCurrencyFromCents(option.totalCents, currency, locale)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("upfrontHint")}</p>
        </div>
      );
    case "unavailable":
      return (
        <div className="rounded-md border border-border p-3">
          <p className="text-sm text-muted-foreground">
            {t("notAvailable", { currency: option.currency })}
          </p>
        </div>
      );
  }
}

function frequencyLabel(
  frequency: SubscriptionFrequency,
  t: ReturnType<typeof useTranslations<"productDetail.pricing">>,
): string {
  switch (frequency) {
    case "monthly":
      return t("subscribeMonthly");
    case "quarterly":
      return t("subscribeQuarterly");
    case "yearly":
      return t("subscribeYearly");
  }
}

function cadenceShort(
  frequency: SubscriptionFrequency,
  t: ReturnType<typeof useTranslations<"productDetail.pricing">>,
): string {
  switch (frequency) {
    case "monthly":
      return t("cadenceMonth");
    case "quarterly":
      return t("cadenceQuarter");
    case "yearly":
      return t("cadenceYear");
  }
}
