"use client";

import { CircleDollarSign, Gift, Info, Percent } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { vatForProductType } from "@/lib/stripe/vat";
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
  const format = useFormatter();

  const billingMode = effectiveBillingMode(config, state.paidMode);
  const isPaid = billingMode === "paid";
  const showPricing = isPaid && config.pricingShape !== "external";
  const pricingShape = effectivePricingShape(config);
  const showExternalInfo = billingMode === "external_contract";

  // What "paid" *means* differs by pricing shape — a club is a monthly
  // subscription, a camp or event a single charge at signup — so the radio that
  // chooses it says which. One sentence for both would be wrong for one of them
  // on the screen where the admin is deciding.
  const paidHint =
    pricingShape === "monthly"
      ? t("hints.paidDetailMonthly")
      : t("hints.paidDetailUpfront");

  // VAT is derived from the product type and shown only for a product that
  // actually reaches Stripe: a free club or a municipality club never produces
  // a sale, so a rate beside them would claim an invoice we never issue.
  const vat = vatForProductType(config.productType);
  // `style: "percent"` defaults to zero fraction digits, which would round both
  // live Finnish rates to a wrong whole number ("14 %", "26 %"). The maximum is
  // a maximum, so a future whole-number rate still renders without a decimal.
  const vatRate = format.number(vat.displayRate, {
    style: "percent",
    maximumFractionDigits: 1,
  });

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
                    "flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors",
                    active && "bg-primary/5"
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
                      {mode === "free" ? t("hints.freeDetail") : paidHint}
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

      {/* Read-only by design: the treatment follows from the product type, and
          an admin who could pick it is an admin who could pick the wrong one. */}
      {isPaid && (
        <div className="flex items-start gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm">
          <Percent className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <div className="font-medium">
              {t(`vat.headline.${vat.treatment}`, { rate: vatRate })}
            </div>
            <p className="text-xs text-muted-foreground">
              {t(`vat.reason.${vat.treatment}`)}
            </p>
            <p className="text-xs text-muted-foreground">{t("vat.note")}</p>
          </div>
        </div>
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
                    "flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm transition-colors",
                    active && "bg-primary/5"
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

      {/* What happens once the cap is reached is the waitlist tick's decision,
          not the cap's: ticked, the overflow queues; unticked, it is turned
          away outright. A single hint would be a lie in one of the two. */}
      {!state.uncapped && (
        <Field
          label={t("labels.seatCount")}
          htmlFor="p-seat"
          hint={t(
            state.waitlistEnabled
              ? "hints.seatHintWaitlist"
              : "hints.seatHintNoWaitlist",
          )}
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
