"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CURRENCY_CONFIG,
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/lib/constants";
import {
  BundlePricePreview,
  SubscriptionPricePreview,
} from "./price-previews";
import type { FxRates } from "@/services/products-v2";

export type PricingShapeUI = "session_and_month" | "upfront_total";

export interface PricingBlockState {
  prices: Record<SupportedCurrency, { session: string; month: string }>;
  manualEdits: Set<SupportedCurrency>;
  activeCurrency: SupportedCurrency;
}

interface PricingBlockProps {
  shape: PricingShapeUI;
  state: PricingBlockState;
  onChange: (next: PricingBlockState) => void;
  fxRates: FxRates | undefined;
}

export function PricingBlock({
  shape,
  state,
  onChange,
  fxRates,
}: PricingBlockProps) {
  const t = useTranslations("admin.productsV2.pricing");
  const { prices, manualEdits, activeCurrency } = state;

  // Re-fill every non-EUR currency from EUR × today's rate whenever EUR
  // changes — except currencies the admin has manually overridden. The
  // effect doesn't add the auto-filled currencies to `manualEdits`, so
  // future EUR edits keep propagating to them. Manual override is one-way
  // (set in `setRow`).
  useEffect(() => {
    if (!fxRates) return;

    const eurSession = Number(prices.eur.session);
    const eurMonth = Number(prices.eur.month);
    const eurSessionFilled =
      prices.eur.session !== "" && Number.isFinite(eurSession);
    const eurMonthFilled =
      prices.eur.month !== "" && Number.isFinite(eurMonth);
    if (!eurSessionFilled && !eurMonthFilled) return;

    const targets = SUPPORTED_CURRENCIES.filter(
      (c) => c !== DEFAULT_CURRENCY && !manualEdits.has(c) && fxRates[c]
    );
    if (targets.length === 0) return;

    const next: PricingBlockState["prices"] = { ...prices };
    let anyChanged = false;
    for (const c of targets) {
      const rate = fxRates[c];
      const nextSession = eurSessionFilled
        ? (eurSession * rate).toFixed(2)
        : "";
      const nextMonth =
        shape === "session_and_month" && eurMonthFilled
          ? (eurMonth * rate).toFixed(2)
          : "";
      if (
        next[c].session !== nextSession ||
        next[c].month !== nextMonth
      ) {
        next[c] = { session: nextSession, month: nextMonth };
        anyChanged = true;
      }
    }
    // Skip the onChange if nothing actually moved — otherwise the effect
    // re-fires on its own state update and we burn a render cycle.
    if (!anyChanged) return;
    onChange({ ...state, prices: next });
  }, [fxRates, prices, manualEdits, shape, state, onChange]);

  const setActive = (currency: SupportedCurrency) => {
    if (currency === activeCurrency) return;
    onChange({ ...state, activeCurrency: currency });
  };

  const setRow = (
    currency: SupportedCurrency,
    field: "session" | "month",
    value: string
  ) => {
    onChange({
      ...state,
      prices: {
        ...prices,
        [currency]: { ...prices[currency], [field]: value },
      },
      // Lock this currency from FX auto-fill so subsequent EUR changes
      // don't overwrite the admin's manual value.
      manualEdits: new Set([...manualEdits, currency]),
    });
  };

  // FX note shows on non-EUR tabs that the admin hasn't overridden, as
  // long as we have rates to display.
  const showSubFxNote =
    activeCurrency !== DEFAULT_CURRENCY &&
    !manualEdits.has(activeCurrency) &&
    Boolean(fxRates);

  const sessionLabel =
    shape === "session_and_month" ? t("perSessionLabel") : t("totalLabel");

  return (
    <div className="space-y-3">
      {/* Currency tabs */}
      <div
        role="tablist"
        aria-label={t("currencyPickerLabel")}
        className="inline-flex rounded-md border border-input p-1"
      >
        {SUPPORTED_CURRENCIES.map((currency) => {
          const cfg = CURRENCY_CONFIG[currency];
          const active = currency === activeCurrency;
          return (
            <button
              key={currency}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActive(currency)}
              className={cn(
                "rounded px-3 py-1 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {cfg.symbol} {cfg.label}
            </button>
          );
        })}
      </div>

      {showSubFxNote && fxRates && (
        <p className="text-xs text-muted-foreground">
          {t("fxSuggested", {
            rate: fxRates[activeCurrency].toFixed(4),
          })}
        </p>
      )}

      {/* Inputs for the active tab */}
      <div
        className={cn(
          "grid gap-4",
          shape === "session_and_month" ? "sm:grid-cols-2" : "sm:grid-cols-1"
        )}
      >
        <div className="space-y-1.5">
          <Label htmlFor={`price-session-${activeCurrency}`}>
            {sessionLabel}
            <span className="ml-0.5 text-destructive">*</span>
          </Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {CURRENCY_CONFIG[activeCurrency].symbol}
            </span>
            <Input
              id={`price-session-${activeCurrency}`}
              type="number"
              min="0"
              step="0.01"
              value={prices[activeCurrency].session}
              onChange={(e) =>
                setRow(activeCurrency, "session", e.target.value)
              }
              required
              className="pl-7"
            />
          </div>
          {shape === "session_and_month" && (
            <BundlePricePreview
              value={prices[activeCurrency].session}
              currency={activeCurrency}
            />
          )}
        </div>

        {shape === "session_and_month" && (
          <div className="space-y-1.5">
            <Label htmlFor={`price-month-${activeCurrency}`}>
              {t("perMonthLabel")}
              <span className="ml-0.5 text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {CURRENCY_CONFIG[activeCurrency].symbol}
              </span>
              <Input
                id={`price-month-${activeCurrency}`}
                type="number"
                min="0"
                step="0.01"
                value={prices[activeCurrency].month}
                onChange={(e) =>
                  setRow(activeCurrency, "month", e.target.value)
                }
                required
                className="pl-7"
              />
            </div>
            <SubscriptionPricePreview
              value={prices[activeCurrency].month}
              currency={activeCurrency}
            />
          </div>
        )}
      </div>
    </div>
  );
}
