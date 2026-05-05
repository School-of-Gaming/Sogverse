"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import type { ProductV2BrowseRow, SubscriptionFrequencyV2 } from "@/types";
import { useCurrency } from "@/providers/currency-provider";
import { resolveLocale } from "@/lib/constants/locales";
import { CURRENCY_CONFIG } from "@/lib/constants/currency";
import {
  useCreateParticipation,
  useJoinWaitlist,
  useMyFamilySubAt,
  type CreateParticipationInput,
} from "@/services/participations";
import { useExternalRedirect } from "@/hooks/use-external-redirect";
import {
  buildPricingOptions,
  findOption,
  type PricingOption,
} from "./pricing-options";
import {
  SignupPanelView,
  type AuthState,
  type MyParticipationState,
  type SignupPanelViewProps,
  type SubCtaMode,
} from "./signup-panel-view";
import type { RegistrationState } from "./derive-registration-state";

// Adapter: owns the form state (gamer / agreed / pricing pick), resolves the
// user's existing family sub status to drive the inline-add CTA copy, and
// fires the create-participation / join-waitlist mutations.

interface SignupPanelProps {
  product: Pick<
    ProductV2BrowseRow,
    "id" | "product_type" | "billing_mode" | "product_prices_v2"
  >;
  state: RegistrationState;
  authState: AuthState;
  /** Already-signed-up state for any of the customer's gamers; null if none. */
  myParticipationState?: MyParticipationState | null;
  /** Render the panel frozen at this instant for deterministic mocks. */
  fixedNowMs?: number;
}

export function SignupPanel({
  product,
  state,
  authState,
  myParticipationState = null,
  fixedNowMs,
}: SignupPanelProps) {
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

  const [userPickedKey, setUserPickedKey] = useState<
    PricingOption["key"] | null
  >(null);
  const selectedPricingKey: PricingOption["key"] =
    userPickedKey !== null && findOption(tracks, userPickedKey) !== null
      ? userPickedKey
      : tracks.defaultKey;

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
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Inline-add detection: only meaningful if the selected pricing is a
  // subscription. We pre-check whether the customer already has a live
  // family sub at the requested (frequency, currency); the route will
  // do the same check authoritatively on submit.
  const selectedOption = findOption(tracks, selectedPricingKey);
  const subFrequency: SubscriptionFrequencyV2 | null =
    selectedOption?.kind === "subscription" ? selectedOption.frequency : null;
  const { data: existingFamSub } = useMyFamilySubAt(subFrequency, currency);
  const subCtaMode: SubCtaMode =
    subFrequency !== null
    && existingFamSub !== null
    && existingFamSub !== undefined
    && ["active", "canceling", "past_due"].includes(existingFamSub.status)
      ? "inline_add"
      : "new";

  const createMutation = useCreateParticipation();
  const waitlistMutation = useJoinWaitlist();
  const { redirecting, redirectTo } = useExternalRedirect();

  const purchaseShape = purchaseShapeFor(selectedOption);

  const handleSubmit = () => {
    if (!selectedGamerId || !purchaseShape) return;
    setSubmitError(null);
    const input: CreateParticipationInput = {
      productId: product.id,
      gamerId: selectedGamerId,
      purchaseShape,
      currency,
      returnPath: typeof window !== "undefined" ? window.location.pathname : undefined,
    };
    createMutation.mutate(input, {
      onSuccess: (response) => {
        if (response.status === "redirect") {
          // Full-page navigation per CLAUDE.md auth/Stripe rule — leaves
          // any client-side state behind so the post-Stripe return reads
          // fresh participations. `redirectTo` keeps the CTA disabled
          // through the unload (mutation.isPending flips false instantly,
          // but the page hasn't swapped yet — without the flag the button
          // re-enables for one frame and a fast user can double-click).
          redirectTo(response.checkoutUrl);
        }
        // 'subscribed' / 'free_confirmed' / 'full' all stay on the page.
        // The mutation's onSuccess invalidates participation/products keys,
        // so the panel's myParticipationState prop will refresh and the
        // success state renders without an explicit transition here.
      },
      onError: (err) => {
        setSubmitError(err instanceof Error ? err.message : "Could not sign up");
      },
    });
  };

  const handleJoinWaitlist = () => {
    if (!selectedGamerId) return;
    setSubmitError(null);
    waitlistMutation.mutate(
      { productId: product.id, gamerId: selectedGamerId },
      {
        onError: (err) => {
          setSubmitError(
            err instanceof Error ? err.message : "Could not join waitlist",
          );
        },
      },
    );
  };

  const viewProps: SignupPanelViewProps = {
    productType: product.product_type,
    state,
    myParticipationState: myParticipationState ?? null,
    myProductsHref: "/clubs",
    authState,
    pricingTracks: tracks,
    selectedPricingKey,
    onSelectPricing: setUserPickedKey,
    selectedGamerId,
    onSelectGamer: setUserPickedGamerId,
    agreed,
    onAgreedChange: setAgreed,
    onSubmit: handleSubmit,
    onJoinWaitlist: handleJoinWaitlist,
    subCtaMode,
    submitting:
      createMutation.isPending || waitlistMutation.isPending || redirecting,
    submitError,
    currency,
    locale: uiLocale,
    fixedNowMs,
  };

  return <SignupPanelView {...viewProps} />;
}

function purchaseShapeFor(
  option: PricingOption | null,
): CreateParticipationInput["purchaseShape"] | null {
  if (!option) return null;
  switch (option.kind) {
    case "subscription":
      if (option.frequency === "monthly") return "subscription_monthly";
      if (option.frequency === "quarterly") return "subscription_quarterly";
      return "subscription_yearly";
    case "bundle":
      if (option.bundleSize === 1) return "bundle_1";
      if (option.bundleSize === 4) return "bundle_4";
      if (option.bundleSize === 10) return "bundle_10";
      return null;
    case "upfront":
      return "single_payment";
    case "free":
      return "free";
    case "external":
    case "unavailable":
      return null;
  }
}
