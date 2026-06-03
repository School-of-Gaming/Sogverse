"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import type { ProductBrowseRow, SubscriptionFrequency } from "@/types";
import { useCurrency } from "@/providers/currency-provider";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { CURRENCY_CONFIG } from "@/lib/constants/currency";
import {
  useCreateParticipation,
  useJoinWaitlist,
  useMyFamilySubAt,
  type CreateParticipationInput,
} from "@/services/participations";
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
    ProductBrowseRow,
    "id" | "product_type" | "billing_mode" | "product_prices"
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
        prices: product.product_prices,
        billingMode: product.billing_mode,
        productType: product.product_type,
        currency,
        currencyLabel: CURRENCY_CONFIG[currency].label,
      }),
    [product.product_prices, product.billing_mode, product.product_type, currency],
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
  const subFrequency: SubscriptionFrequency | null =
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

  // Per CLAUDE.md "Loading & Disabled State": flip true synchronously *before*
  // the mutation so there's no render where the button is enabled between
  // the click and the outcome. `mutation.isPending` alone doesn't suffice —
  // it flips false the instant React Query dispatches the success state, but
  // the navigation/panel-swap hasn't happened yet, so the CTA briefly
  // re-enables. Only cleared on retry-able outcomes (`full`, error). For
  // 'redirect', the page unloads. For 'subscribed' / 'free_confirmed', the
  // panel swaps to AlreadySignedUpPanel via the myParticipationState refresh.
  const [committing, setCommitting] = useState(false);

  const purchaseShape = purchaseShapeFor(selectedOption);

  const handleSubmit = () => {
    if (!selectedGamerId || !purchaseShape) return;
    setSubmitError(null);
    setCommitting(true);
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
          window.location.href = response.checkoutUrl;
          return;
        }
        if (response.status === "full") {
          // Seat went between the click and the server-side check. The panel
          // will swap to FullWaitlistPanel once participation queries refetch
          // — release so the new "Join the waitlist" button is clickable.
          setCommitting(false);
        }
      },
      onError: (err) => {
        setCommitting(false);
        setSubmitError(err instanceof Error ? err.message : "Could not sign up");
      },
    });
  };

  const handleJoinWaitlist = () => {
    if (!selectedGamerId) return;
    setSubmitError(null);
    setCommitting(true);
    waitlistMutation.mutate(
      { productId: product.id, gamerId: selectedGamerId },
      {
        onError: (err) => {
          setCommitting(false);
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
    myProductsHref: ROUTES.shopBrowse(product.product_type),
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
    submitting: committing,
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
