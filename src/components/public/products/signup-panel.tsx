"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import type { ProductBrowseRow } from "@/types";
import { AddGamerDialog } from "@/components/family";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { CURRENCY_CONFIG, DEFAULT_CURRENCY } from "@/lib/constants/currency";
import {
  useCreateParticipation,
  useJoinWaitlist,
  type CreateParticipationInput,
} from "@/services/participations";
import { buildPricingOption, type PricingOption } from "./pricing-options";
import {
  SignupPanelView,
  type AuthState,
  type SignupPanelViewProps,
} from "./signup-panel-view";
import type { RegistrationState } from "./derive-registration-state";

// Adapter: owns the form state (gamer / agreed / pricing pick) and fires the
// create-participation / join-waitlist mutations. Every paid signup goes
// through Stripe Checkout (one Stripe sub per gamer×club for subscriptions),
// so there's no "add to existing sub" branch to detect.

interface SignupPanelProps {
  product: Pick<
    ProductBrowseRow,
    "id" | "product_type" | "billing_mode" | "product_prices"
  >;
  state: RegistrationState;
  authState: AuthState;
  /** Render the panel frozen at this instant for deterministic mocks. */
  fixedNowMs?: number;
}

export function SignupPanel({
  product,
  state,
  authState,
  fixedNowMs,
}: SignupPanelProps) {
  const router = useRouter();
  const uiLocale = resolveLocale(useLocale());
  // Platform is EUR-only; Stripe Adaptive Pricing handles the customer's
  // local currency at checkout. See src/lib/constants/currency.ts.
  const currency = DEFAULT_CURRENCY;

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

  const [userPickedGamerId, setUserPickedGamerId] = useState<string | null>(
    null,
  );
  // Only children who aren't already on the product can be selected. The
  // default falls to the first selectable child (skipping any that are already
  // signed up / waitlisted); a user pick of a locked child is ignored. When
  // every child is already on, this resolves to null and the CTA stays
  // disabled — the page still renders, the picker just shows their states.
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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [addGamerOpen, setAddGamerOpen] = useState(false);

  const createMutation = useCreateParticipation();
  const waitlistMutation = useJoinWaitlist();

  // Per CLAUDE.md "Loading & Disabled State": flip true synchronously *before*
  // the mutation so there's no render where the button is enabled between
  // the click and the outcome. `mutation.isPending` alone doesn't suffice —
  // it flips false the instant React Query dispatches the success state, but
  // the navigation/panel-swap hasn't happened yet, so the CTA briefly
  // re-enables. Only cleared on retry-able outcomes (`full`, error). For both
  // 'redirect' (Stripe) and 'free_confirmed' (router.push to the confirmation
  // page) the outgoing page unloads/unmounts, so the flag stays set through
  // the navigation.
  const [committing, setCommitting] = useState(false);

  const purchaseShape = purchaseShapeFor(pricingOption);

  const handleSubmit = () => {
    if (!selectedGamerId || !purchaseShape) return;
    setSubmitError(null);
    setCommitting(true);
    const input: CreateParticipationInput = {
      productId: product.id,
      gamerId: selectedGamerId,
      purchaseShape,
      currency,
    };
    createMutation.mutate(input, {
      onSuccess: (response) => {
        if (response.status === "redirect") {
          window.location.href = response.checkoutUrl;
          return;
        }
        if (response.status === "free_confirmed") {
          // Free events skip Stripe — send the parent to the same confirmation
          // page the paid flow lands on. Keep `committing` set so the CTA stays
          // disabled through the navigation (the panel unmounts on push).
          router.push(ROUTES.shopConfirmation(response.participationId));
          return;
        }
        // Only 'full' remains: the seat went between the click and the
        // server-side check. The panel will swap to FullWaitlistPanel once
        // participation queries refetch — release so the new "Join the
        // waitlist" button is clickable.
        setCommitting(false);
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
    authState,
    pricingOption,
    selectedGamerId,
    onSelectGamer: setUserPickedGamerId,
    onAddGamer: () => setAddGamerOpen(true),
    agreed,
    onAgreedChange: setAgreed,
    onSubmit: handleSubmit,
    onJoinWaitlist: handleJoinWaitlist,
    submitting: committing,
    submitError,
    currency,
    locale: uiLocale,
    fixedNowMs,
  };

  return (
    <>
      <SignupPanelView {...viewProps} />
      {/* Reusable family dialog — handles its own PIN gate (create/enter PIN)
          before showing the form, so no pre-check is needed here. On success
          we pre-select the new gamer; useCreateGamer invalidates the gamers
          query, so the child appears in the picker and resolves as selected. */}
      <AddGamerDialog
        open={addGamerOpen}
        onOpenChange={setAddGamerOpen}
        onCreated={(gamerId) => setUserPickedGamerId(gamerId)}
      />
    </>
  );
}

function purchaseShapeFor(
  option: PricingOption,
): CreateParticipationInput["purchaseShape"] | null {
  switch (option.kind) {
    case "subscription":
      return "subscription_monthly";
    case "upfront":
      return "single_payment";
    case "free":
      return "free";
    case "external":
    case "unavailable":
      return null;
  }
}
