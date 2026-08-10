"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductBrowseRow } from "@/types";
import { AddGamerDialog } from "@/components/family";
import { ROUTES } from "@/lib/constants";
import {
  useCreateParticipation,
  useJoinWaitlist,
  type CreateParticipationInput,
} from "@/services/participations";
import { purchaseShapeFor } from "./pricing-options";
import {
  SignupPanelView,
  type AuthState,
  type SignupPanelViewProps,
} from "./signup-panel-view";
import { useSignupPanelFields } from "./use-signup-panel-fields";
import type { RegistrationState } from "./derive-registration-state";

// Production adapter: takes the shared view fields from `useSignupPanelFields`
// (gamer / agreed / pricing — the same hook the preview panel uses) and adds the
// live create-participation / join-waitlist mutations on top. Every paid signup
// goes through Stripe Checkout (one Stripe sub per gamer×club for
// subscriptions), so there's no "add to existing sub" branch to detect.

interface SignupPanelProps {
  product: Pick<
    ProductBrowseRow,
    "id" | "product_type" | "billing_mode" | "product_prices"
  >;
  state: RegistrationState;
  authState: AuthState;
}

export function SignupPanel({
  product,
  state,
  authState,
}: SignupPanelProps) {
  const router = useRouter();
  // Pricing / gamer selection / agreed / locale+currency — the view props
  // shared verbatim with the preview panel. This panel only adds the live
  // mutation actions on top, so the demo can't drift from the real UI.
  const fields = useSignupPanelFields(product, authState);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [addGamerOpen, setAddGamerOpen] = useState(false);

  const createMutation = useCreateParticipation();
  const waitlistMutation = useJoinWaitlist();

  // Per CLAUDE.md "Loading & Disabled State": flip true synchronously *before*
  // the mutation so there's no render where the button is enabled between
  // the click and the outcome. `mutation.isPending` alone doesn't suffice —
  // it flips false the instant React Query dispatches the success state, but
  // the navigation/panel-swap hasn't happened yet, so the CTA briefly
  // re-enables. Only cleared on retry-able outcomes (`full`, error). For
  // 'redirect' (Stripe), 'free_confirmed', and a waitlist join — all of which
  // navigate to the confirmation page — the outgoing page unloads/unmounts, so
  // the flag stays set through the navigation.
  //
  // The await behind this spinner is also load-bearing for correctness, not
  // just UX: for 'free_confirmed' and the waitlist join we router.push to the
  // summary, which reads the participation row by id — so we must wait for the
  // create/join mutation to commit that row before navigating, or the summary
  // races the write and 404s. (The preview panel fakes this wait to match.)
  const [committing, setCommitting] = useState(false);

  const purchaseShape = purchaseShapeFor(fields.pricingOption);

  const handleSubmit = () => {
    if (!fields.selectedGamerId || !purchaseShape) return;
    setSubmitError(null);
    setCommitting(true);
    const input: CreateParticipationInput = {
      productId: product.id,
      gamerId: fields.selectedGamerId,
      purchaseShape,
      currency: fields.currency,
    };
    createMutation.mutate(input, {
      onSuccess: (response) => {
        if (response.status === "redirect") {
          window.location.href = response.checkoutUrl;
          return;
        }
        if (
          response.status === "free_confirmed" ||
          response.status === "external_confirmed"
        ) {
          // No-charge signups skip Stripe — the participation is already
          // active. That is any product whose billing is free (a club as
          // readily as an event; this branch has never read product_type) plus
          // the externally-contracted municipality clubs. Send the parent to
          // the same confirmation page the paid flow lands on. Keep
          // `committing` set so the CTA stays disabled through the navigation
          // (the panel unmounts on push).
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
    if (!fields.selectedGamerId) return;
    setSubmitError(null);
    setCommitting(true);
    waitlistMutation.mutate(
      { productId: product.id, gamerId: fields.selectedGamerId },
      {
        onSuccess: (response) => {
          // Mirror the free-signup branch: land the parent on the summary
          // (waitlist variant). Keep `committing` set — the panel unmounts on nav.
          router.push(ROUTES.shopConfirmation(response.participationId));
        },
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
    ...fields,
    state,
    authState,
    onAddGamer: () => setAddGamerOpen(true),
    onSubmit: handleSubmit,
    onJoinWaitlist: handleJoinWaitlist,
    submitting: committing,
    submitError,
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
        onCreated={fields.onSelectGamer}
      />
    </>
  );
}
