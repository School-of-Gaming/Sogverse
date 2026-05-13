"use client";

import { useTranslations } from "next-intl";
import {
  useDefaultPaymentMethod,
  type PaymentMethodSummary,
} from "@/services/billing";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Brand names are proper nouns — render as-is, no translation. "unknown" is
// Stripe's bucket for cards whose network couldn't be identified.
const BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
  unknown: "Card",
};

function brandLabel(brand: string): string {
  return BRAND_LABELS[brand] ?? "Card";
}

function formatExpiry(month: number, year: number): string {
  const mm = String(month).padStart(2, "0");
  const yy = String(year % 100).padStart(2, "0");
  return `${mm}/${yy}`;
}

export type PaymentMethodCardViewProps = {
  isLoading?: boolean;
  isError?: boolean;
  paymentMethod: PaymentMethodSummary | null;
};

/**
 * Pure prop-driven view. Used directly by /admin/ui-components to render
 * deterministic demos of each state.
 */
export function PaymentMethodCardView({
  isLoading,
  isError,
  paymentMethod,
}: PaymentMethodCardViewProps) {
  const t = useTranslations("parent.billing.paymentMethod");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("title")}</CardTitle>
      </CardHeader>
      {/* Fixed h-12 (= content row 1.5rem + bottom padding 1.5rem) so the
          three states render at exactly the same outer height. */}
      <CardContent className="h-12">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <p className="text-sm leading-6 text-destructive">{t("error")}</p>
        ) : paymentMethod ? (
          <FilledState
            card={paymentMethod}
            expiresLabel={t("expires", {
              date: formatExpiry(paymentMethod.exp_month, paymentMethod.exp_year),
            })}
          />
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">{t("empty")}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function PaymentMethodCard() {
  const { data, isLoading, isError } = useDefaultPaymentMethod();
  return (
    <PaymentMethodCardView
      isLoading={isLoading}
      isError={isError}
      paymentMethod={data ?? null}
    />
  );
}

function FilledState({
  card,
  expiresLabel,
}: {
  card: PaymentMethodSummary;
  expiresLabel: string;
}) {
  return (
    <p className="flex items-baseline gap-x-2 whitespace-nowrap leading-6">
      <span className="font-medium">{brandLabel(card.brand)}</span>
      {/* eslint-disable-next-line i18next/no-literal-string -- masked-card bullets are a universal display convention, not translatable copy */}
      <span className="font-mono tracking-wider text-muted-foreground">
        •••• {card.last4}
      </span>
      {/* eslint-disable-next-line i18next/no-literal-string -- typographic middle-dot separator, same in every locale */}
      <span aria-hidden className="text-muted-foreground">·</span>
      <span className="text-sm text-muted-foreground">{expiresLabel}</span>
    </p>
  );
}

function LoadingState() {
  return (
    <div className="h-6 w-72 max-w-full animate-pulse rounded bg-muted" aria-hidden />
  );
}
