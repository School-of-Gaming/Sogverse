"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import type { ProductBrowseRow, ProductType } from "@/types";
import { resolveLocale } from "@/lib/constants/locales";
import {
  CURRENCY_CONFIG,
  DEFAULT_CURRENCY,
  type SupportedCurrency,
} from "@/lib/constants/currency";
import { buildPricingOption, type PricingOption } from "./pricing-options";
import type { AuthState } from "./signup-panel-view";

// The slice of `SignupPanelView`'s props that is identical whether the panel
// fires real mutations (production `SignupPanel`) or just navigates (preview
// `PreviewSignupPanel`): pricing, gamer selection, the rules checkbox, and the
// locale/currency. BOTH panels build their view props from this one hook, so
// the only thing that can differ between prod and preview is the injected
// action (`onSubmit` / `onJoinWaitlist`). The demo therefore can't silently
// drift from the real UI — anything visual lives in `SignupPanelView`, and
// everything feeding it lives here.
export interface SignupPanelFields {
  productType: ProductType;
  pricingOption: PricingOption;
  selectedGamerId: string | null;
  onSelectGamer: (gamerId: string) => void;
  agreed: boolean;
  onAgreedChange: (next: boolean) => void;
  currency: SupportedCurrency;
  locale: string;
}

export function useSignupPanelFields(
  product: Pick<
    ProductBrowseRow,
    "product_type" | "billing_mode" | "product_prices"
  >,
  authState: AuthState,
): SignupPanelFields {
  // Platform is EUR-only; Stripe Adaptive Pricing handles the customer's local
  // currency at checkout. See src/lib/constants/currency.ts.
  const currency = DEFAULT_CURRENCY;
  const locale = resolveLocale(useLocale());

  const pricingOption = useMemo(
    () =>
      buildPricingOption({
        prices: product.product_prices,
        billingMode: product.billing_mode,
        productType: product.product_type,
        currency,
        currencyLabel: CURRENCY_CONFIG[currency].label,
      }),
    [product.product_prices, product.billing_mode, product.product_type, currency],
  );

  // Only children who aren't already on the product are selectable. The default
  // falls to the first selectable child (skipping any already signed up /
  // waitlisted); a user pick of a now-locked child is ignored. When every child
  // is already on, this resolves to null and the CTA stays disabled — the page
  // still renders, the picker just shows their states.
  const [userPickedGamerId, setUserPickedGamerId] = useState<string | null>(
    null,
  );
  const selectableGamers =
    authState.kind === "ready"
      ? authState.gamers.filter((g) => !g.signupState)
      : [];
  const selectedGamerId: string | null =
    authState.kind === "ready"
      ? userPickedGamerId !== null &&
        selectableGamers.some((g) => g.id === userPickedGamerId)
        ? userPickedGamerId
        : (selectableGamers[0]?.id ?? null)
      : null;

  const [agreed, setAgreed] = useState(false);

  return {
    productType: product.product_type,
    pricingOption,
    selectedGamerId,
    onSelectGamer: setUserPickedGamerId,
    agreed,
    onAgreedChange: setAgreed,
    currency,
    locale,
  };
}
