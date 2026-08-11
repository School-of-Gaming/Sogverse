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
  /** `products.for_gamers` — see the prop of the same name on the view. */
  forGamers: boolean;
  pricingOption: PricingOption;
  selectedParticipantId: string | null;
  onSelectParticipant: (participantId: string) => void;
  agreed: boolean;
  onAgreedChange: (next: boolean) => void;
  currency: SupportedCurrency;
  locale: string;
}

export function useSignupPanelFields(
  product: Pick<
    ProductBrowseRow,
    "product_type" | "billing_mode" | "product_prices" | "for_gamers"
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

  // Only participants who aren't already on the product are selectable. The
  // default falls to the first selectable one (skipping anyone already signed
  // up / waitlisted); a user pick of a now-locked row is ignored. When everyone
  // is already on, this resolves to null and the CTA stays disabled — the page
  // still renders, the picker just shows their states.
  //
  // The parent's own row (a for-parents product) is an ordinary member of this
  // list: the adapter puts it in the array and nothing here has to know. On a
  // parents-only product it is the only row, so "the first selectable one"
  // is the preselection the plan asks for, with no special case.
  const [userPickedParticipantId, setUserPickedParticipantId] = useState<
    string | null
  >(null);
  const selectable =
    authState.kind === "ready"
      ? authState.participants.filter((p) => !p.signupState)
      : [];
  const selectedParticipantId: string | null =
    authState.kind === "ready"
      ? userPickedParticipantId !== null &&
        selectable.some((p) => p.id === userPickedParticipantId)
        ? userPickedParticipantId
        : (selectable[0]?.id ?? null)
      : null;

  const [agreed, setAgreed] = useState(false);

  return {
    productType: product.product_type,
    forGamers: product.for_gamers,
    pricingOption,
    selectedParticipantId,
    onSelectParticipant: setUserPickedParticipantId,
    agreed,
    onAgreedChange: setAgreed,
    currency,
    locale,
  };
}
