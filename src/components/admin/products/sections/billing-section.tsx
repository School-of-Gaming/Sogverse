"use client";

import { CircleDollarSign, Gift, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { FormSection } from "../form-primitives";
import { PricingBlock } from "../pricing-block";
import {
  SEAT_LIMIT_MODE_VALUES,
  effectivePricingShape,
  offersUncapped,
  withPaidMode,
  type FormState,
} from "../product-form-state";
import {
  PAID_MODE_VALUES,
  effectiveBillingMode,
} from "../product-type-config";
import type { ProductTypeConfig } from "../product-type-config";

interface BillingSectionProps {
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
  config: ProductTypeConfig;
}

export function BillingSection({
  state,
  setState,
  config,
}: BillingSectionProps) {
  const t = useTranslations("admin.products");

  const billingMode = effectiveBillingMode(config, state.paidMode);
  const isPaid = billingMode === "paid";
  const showPricing = isPaid && config.pricingShape !== "external";
  const pricingShape = effectivePricingShape(config);
  const showExternalInfo = billingMode === "external_contract";

  // Seats: a cap is available on every type and optional on all but one.
  // Municipality clubs are contracted for a fixed number of places, so instead
  // of a chooser whose second option they may never pick, they get the number
  // field on its own — required, with nothing to decide first.
  const showSeatLimitChooser = offersUncapped(config);

  return (
    <FormSection
      title={t("sections.billing")}
      description={t(`sections.billingDescription.${config.i18nKey}`)}
    >
      {config.billing.mode === "free_or_paid" && (
        <Field label={t("labels.billing")} hint={t("hints.billingHint")}>
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
                    onChange={() => setState(withPaidMode(state, mode))}
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
            pricingShape === "monthly"
              ? t("hints.pricingMonthly")
              : t("hints.pricingUpfront")
          }
        >
          <PricingBlock
            shape={pricingShape}
            state={{ prices: state.prices }}
            onChange={(next) => setState({ ...state, ...next })}
          />
        </Field>
      )}

      {showSeatLimitChooser && (
        <Field label={t("labels.seatLimit")} hint={t("hints.seatLimitHint")}>
          <div className="grid gap-3 sm:grid-cols-2">
            {SEAT_LIMIT_MODE_VALUES.map((mode) => {
              const active = state.uncapped === (mode === "unlimited");
              return (
                <label
                  key={mode}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors",
                    active
                      ? "border-primary bg-primary/5"
                      : "border-input hover:border-foreground/30"
                  )}
                >
                  <input
                    type="radio"
                    name="seatLimitMode"
                    checked={active}
                    onChange={() =>
                      setState({ ...state, uncapped: mode === "unlimited" })
                    }
                    className="mt-1 h-4 w-4"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {t(`seatLimitModes.${mode}`)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t(`seatLimitModes.${mode}Description`)}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </Field>
      )}

      {!state.uncapped && (
        <Field
          label={t("labels.seatCount")}
          htmlFor="p-seat"
          hint={t("hints.seatHint")}
        >
          <Input
            id="p-seat"
            type="number"
            min="1"
            value={state.seatCount}
            onChange={(e) =>
              setState({ ...state, seatCount: e.target.value })
            }
            className="max-w-[220px]"
            required
          />
        </Field>
      )}

      {/* The waitlist is the queue behind a cap, so the toggle only exists while
          one is set — and picking Unlimited deliberately leaves the flag alone
          rather than clearing it, so toggling back restores the admin's tick.
          What stops that hidden `true` reaching the database is the build, which
          derives `waitlist_enabled` from the cap instead of copying this flag. */}
      {!state.uncapped && (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={state.waitlistEnabled}
            onChange={(e) =>
              setState({ ...state, waitlistEnabled: e.target.checked })
            }
          />
          <span>{t("labels.waitlistToggle")}</span>
        </label>
      )}
    </FormSection>
  );
}
