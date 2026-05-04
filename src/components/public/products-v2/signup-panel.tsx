"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import type { ProductV2BrowseRow } from "@/types";
import { useCurrency } from "@/providers/currency-provider";
import { resolveLocale } from "@/lib/constants/locales";
import { CURRENCY_CONFIG } from "@/lib/constants/currency";
import {
  buildPricingOptions,
  findOption,
  type PricingOption,
} from "./pricing-options";
import {
  SignupPanelView,
  type AuthState,
  type SignupPanelViewProps,
} from "./signup-panel-view";
import type { RegistrationState } from "./derive-registration-state";

// Adapter: owns the signup-panel form state (which gamer, which pricing
// option, agreed-to-rules), resolves pricing tracks against the live
// currency provider, and forwards everything to the pure View.
//
// The submit handler is a no-op for this UI-only phase — wired up later
// when Stripe Checkout lands. See `docs/products-v2-architecture.md` §
// "Use Stripe `capture_method: 'manual'`" for the seat-race story.

interface SignupPanelProps {
  product: Pick<
    ProductV2BrowseRow,
    "product_type" | "billing_mode" | "product_prices_v2"
  >;
  state: RegistrationState;
  authState: AuthState;
  /** Render the panel frozen at this instant for deterministic mocks. */
  fixedNowMs?: number;
}

export function SignupPanel({ product, state, authState, fixedNowMs }: SignupPanelProps) {
  const uiLocale = resolveLocale(useLocale());
  const { currency } = useCurrency();

  const tracks = useMemo(
    () =>
      buildPricingOptions({
        prices: product.product_prices_v2,
        billingMode: product.billing_mode,
        productType: product.product_type,
        currency,
        currencyLabel: CURRENCY_CONFIG[currency].label,
      }),
    [product.product_prices_v2, product.billing_mode, product.product_type, currency],
  );

  // User overrides go through `userPickedKey`. The actual selected key
  // is *derived* from the user pick + the live tracks, so the panel
  // doesn't need a setState-in-effect to re-anchor when currency changes
  // (the old key may no longer exist in the new tracks).
  const [userPickedKey, setUserPickedKey] = useState<
    PricingOption["key"] | null
  >(null);
  const selectedPricingKey: PricingOption["key"] =
    userPickedKey !== null && findOption(tracks, userPickedKey) !== null
      ? userPickedKey
      : tracks.defaultKey;

  // Same derive-not-store pattern for the selected gamer. The user's
  // pick is honored only while it still matches a real gamer row;
  // otherwise we default to the first gamer.
  const [userPickedGamerId, setUserPickedGamerId] = useState<string | null>(
    null,
  );
  const selectedGamerId: string | null =
    authState.kind === "ready"
      ? userPickedGamerId !== null &&
        authState.gamers.some((g) => g.id === userPickedGamerId)
        ? userPickedGamerId
        : (authState.gamers[0]?.id ?? null)
      : null;

  const [agreed, setAgreed] = useState(false);

  const viewProps: SignupPanelViewProps = {
    productType: product.product_type,
    state,
    authState,
    pricingTracks: tracks,
    selectedPricingKey,
    onSelectPricing: setUserPickedKey,
    selectedGamerId,
    onSelectGamer: setUserPickedGamerId,
    agreed,
    onAgreedChange: setAgreed,
    onSubmit: () => {
      // No-op for the UI-only phase. Stripe Checkout wires up next.
    },
    currency,
    locale: uiLocale,
    fixedNowMs,
  };

  return <SignupPanelView {...viewProps} />;
}
