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
  fxFilled: Set<SupportedCurrency>;
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
  const { prices, fxFilled, activeCurrency } = state;

  // Auto-fill from EUR rate the first time the admin lands on a non-EUR
  // tab — only if EUR has at least one value set and the target tab hasn't
  // been auto-filled or manually edited yet. Once `fxFilled` includes the
  // target, subsequent visits don't overwrite manual edits.
  useEffect(() => {
    if (activeCurrency === DEFAULT_CURRENCY) return;
    if (fxFilled.has(activeCurrency)) return;
    if (!fxRates) return;
    const rate = fxRates[activeCurrency];
    if (!rate) return;

    const eurSession = Number(prices.eur.session);
    const eurMonth = Number(prices.eur.month);
    const eurSessionFilled =
      prices.eur.session !== "" && Number.isFinite(eurSession);
    const eurMonthFilled =
      prices.eur.month !== "" && Number.isFinite(eurMonth);
    if (!eurSessionFilled && !eurMonthFilled) return;

    const next: PricingBlockState["prices"] = { ...prices };
    next[activeCurrency] = {
      session: eurSessionFilled ? (eurSession * rate).toFixed(2) : "",
      month:
        shape === "session_and_month" && eurMonthFilled
          ? (eurMonth * rate).toFixed(2)
          : "",
    };
    onChange({
      ...state,
      prices: next,
      fxFilled: new Set([...fxFilled, activeCurrency]),
    });
  }, [activeCurrency, fxRates, prices, fxFilled, shape, state, onChange]);

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
      // Mark the tab as "manually filled" so the FX auto-fill won't
      // overwrite the value next time we land on it.
      fxFilled: new Set([...fxFilled, currency]),
    });
  };

  const showSubFxNote =
    activeCurrency !== DEFAULT_CURRENCY &&
    fxFilled.has(activeCurrency) &&
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
