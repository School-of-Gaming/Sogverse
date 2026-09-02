"use client";

import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { formatCurrencyFromCents } from "@/lib/utils";
import { SUPPORT_EMAIL } from "@/lib/constants";
import type { SupportedCurrency } from "@/lib/constants/currency";
import type { PricingOption } from "./pricing-options";

// Single-option price display. There is one purchase option per product, so
// this is purely informational — no selection. Consumer clubs show the
// monthly subscription price; camps/paid events the upfront total; free
// products a no-payment note, and municipality (external) ones who bears the
// cost instead.

// **This section carries no box**, and that is the panel's one rule doing its
// work: a border means you can act on it. Elsewhere in the panel a bordered box
// is the signal for something clickable — a participant row, the consent
// toggle, the add-a-child affordance. The price is none of those: it is a
// statement of what the thing costs, with no choice attached (there is one
// purchase option per product), so a box around it would promise an interaction
// that does not exist.

interface PricingPanelViewProps {
  option: PricingOption;
  currency: SupportedCurrency;
  locale: string;
  /**
   * Already-formatted date of the first charge, when a subscription's billing is
   * deferred to a start date still ahead. Null everywhere else — including on
   * every non-subscription option, which is why only that branch reads it.
   */
  firstChargeDate?: string | null;
}

export function PricingPanelView({
  option,
  currency,
  locale,
  firstChargeDate = null,
}: PricingPanelViewProps) {
  return (
    <div className="space-y-3">
      <OptionRow
        option={option}
        currency={currency}
        locale={locale}
        firstChargeDate={firstChargeDate}
      />
      {/* A paid club, and nothing else. The guarantee is real for clubs only —
          camps and events are paid upfront against a held seat, a free or
          municipality-funded product has no money to give back — so the
          `subscription` option *is* the condition: it is the one kind
          `buildPricingOption` returns for a paid consumer club. Rendered from
          the same prop the price above reads, so it is on screen at first paint
          and never arrives late to push the CTA down. */}
      {option.kind === "subscription" && <MoneyBackGuarantee />}
    </div>
  );
}

/**
 * The 30-day money-back guarantee, stated plainly on the panel where a parent
 * decides. No hedging and no conditions in the small print: the window runs
 * from the child's first session (the later of the two events, and the only
 * point at which a family can know), the refund is manual through support, and
 * the copy says so rather than implying a button exists.
 */
function MoneyBackGuarantee() {
  const t = useTranslations("productDetail.pricing.guarantee");
  return (
    <div className="flex gap-2.5 border-t border-border pt-3">
      <ShieldCheck
        className="mt-0.5 h-4 w-4 shrink-0 text-success"
        aria-hidden="true"
      />
      <div className="space-y-1">
        <p className="text-sm font-semibold">{t("title")}</p>
        <p className="text-xs text-muted-foreground">{t("body")}</p>
        <p className="text-xs text-muted-foreground">
          {t.rich("contact", {
            email: SUPPORT_EMAIL,
            link: (chunks) => (
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-primary hover:underline"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </div>
    </div>
  );
}

function OptionRow({
  option,
  currency,
  locale,
  firstChargeDate,
}: {
  option: PricingOption;
  currency: SupportedCurrency;
  locale: string;
  firstChargeDate: string | null;
}) {
  const t = useTranslations("productDetail.pricing");
  switch (option.kind) {
    case "subscription":
      return (
        <div>
          <p className="text-base font-bold tabular-nums">
            {formatCurrencyFromCents(option.totalCents, currency, locale)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {t("cadenceMonth")}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("subscriptionHint")}
          </p>
          {/* The club has not started, so Stripe will show €0 due today. Say
              why, and say when the money actually moves, before the parent
              clicks through to a page that would otherwise look like a
              mistake. Rendered from data present on first paint, so it never
              arrives late and pushes the CTA down. */}
          {/* Wit, not amber: this line is a date ahead — when the money will
              move — and time ahead is wit's word. Amber is the act family, and
              there is nothing to act on here; the CTA below is the act. */}
          {firstChargeDate !== null && (
            <p className="mt-1.5 text-xs font-medium text-yty-wit-soft">
              {t("firstChargeOn", { date: firstChargeDate })}
            </p>
          )}
        </div>
      );
    case "upfront":
      return (
        <div>
          <p className="text-base font-bold tabular-nums">
            {formatCurrencyFromCents(option.totalCents, currency, locale)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("upfrontHint")}
          </p>
        </div>
      );
    case "free":
      return (
        <div>
          <p className="text-base font-bold">{t("free")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("freeHint")}</p>
        </div>
      );
    case "external":
      // The one option with no second line. It used to carry a hint saying no
      // payment was needed, which is only true of our till: some municipalities
      // ask families for a small fee of their own, and a parent who has been
      // told that by their council reads ours as a contradiction. Everything
      // honest that could stand there instead was a description of who invoices
      // whom — our arrangement with the municipality, not a fact a family has
      // any use for — so the line above states who bears the cost and stops.
      return <p className="text-base font-bold">{t("external")}</p>;
    case "unavailable":
      return (
        <div>
          <p className="text-sm text-muted-foreground">
            {t("notAvailable", { currency: option.currency })}
          </p>
        </div>
      );
  }
}
