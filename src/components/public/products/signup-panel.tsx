"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductBrowseRow } from "@/types";
import { AddGamerDialog } from "@/components/family";
import type { LocationPick } from "@/components/locations/location-picker-panel";
import { ROUTES } from "@/lib/constants";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { useAuth } from "@/providers/auth-provider";
import {
  useCreateParticipation,
  useJoinWaitlist,
  type CreateParticipationInput,
} from "@/services/participations";
import { useUpdateProfile } from "@/services/users";
import { purchaseShapeFor } from "./pricing-options";
import type { RegionGate } from "./region-lock/region-gate";
import { SetLocationDialog } from "./region-lock/set-location-dialog";
import {
  SignupPanelView,
  type AuthState,
  type ConfirmedHomeLocation,
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
    | "id"
    | "product_type"
    | "billing_mode"
    | "product_prices"
    | "for_gamers"
    // The two the deferred-first-charge line is derived from — see
    // `useSignupPanelFields`.
    | "start_date"
    | "timezone"
  >;
  state: RegistrationState;
  authState: AuthState;
  /**
   * The region lock's answer for this viewer, derived by the page above — which
   * is where the reads behind it live, and where the page holds its first paint
   * until they have landed.
   */
  regionGate: RegionGate;
  /**
   * The family's home location as the viewer's locale spells it, resolved by
   * the page from the row its keyed read returned (or from a pick confirmed
   * here). Read only by the gate's `eligible` variant.
   */
  homeLocationName: string | null;
  /**
   * A place confirmed in the location dialog. The page holds it so the gate
   * re-derives on the spot rather than waiting for the keyed read of a row the
   * picker just handed us.
   */
  onLocationConfirmed: (confirmed: ConfirmedHomeLocation) => void;
}

export function SignupPanel({
  product,
  state,
  authState,
  regionGate,
  homeLocationName,
  onLocationConfirmed,
}: SignupPanelProps) {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  // Pricing / gamer selection / agreed / locale+currency — the view props
  // shared verbatim with the preview panel. This panel only adds the live
  // mutation actions on top, so the demo can't drift from the real UI.
  const fields = useSignupPanelFields(product, authState);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [addGamerOpen, setAddGamerOpen] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);

  const createMutation = useCreateParticipation();
  const waitlistMutation = useJoinWaitlist();
  const updateProfile = useUpdateProfile();

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
    if (!fields.selectedParticipantId || !purchaseShape) return;
    setSubmitError(null);
    setCommitting(true);
    const input: CreateParticipationInput = {
      productId: product.id,
      // The parent's own id when they picked their own row. The route pins
      // `p_customer_id` to the session user either way and the RPC's audience
      // gate is what decides whether the pair is allowed — nothing here has to
      // tell the two cases apart.
      participantId: fields.selectedParticipantId,
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
    if (!fields.selectedParticipantId) return;
    setSubmitError(null);
    setCommitting(true);
    waitlistMutation.mutate(
      { productId: product.id, participantId: fields.selectedParticipantId },
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

  /**
   * The parent's home location, written the way the settings form writes it:
   * one plain profile update on the same column, under the same self-scoped
   * policy. No guard is needed against clobbering a stored value — the dialog
   * is only ever offered when there is none.
   *
   * **The promise this returns is the write, and only the write.** The dialog
   * shows an error when it rejects, so anything awaited here is something a
   * parent can be told failed — and a committed save reported as a failure is
   * the worst outcome available: they retry a write that already landed, or
   * walk away from a purchase that was one click from done.
   *
   * So the profile refresh that follows is deliberately not part of it. It is a
   * consistency chore for the *other* surfaces in this document, not a step in
   * what the parent just asked for, and the gate has already re-derived from
   * the pick the picker handed us. Fire it, catch it, and let the page carry on
   * saying what it already knows to be true.
   *
   * Rejections of the write itself propagate: the dialog re-enables its button
   * and shows why.
   */
  const saveHomeLocation = async (pick: LocationPick) => {
    // Structurally unreachable: the gate only asks for a location when the
    // viewer is a signed-in parent, which is what put a `user` in context.
    if (!user) return;
    await updateProfile.mutateAsync({
      userId: user.id,
      updates: { home_location_id: pick.location.id },
    });
    // The pick goes up whatever it carries, **including a row with no country
    // at all**. That is not nothing: it is the same fact the gate already fails
    // open on when it reads a codeless row for itself, and it deserves the same
    // answer from whichever direction it arrives. Withholding it instead —
    // leaving the keyed read as the authority — is what wedges the panel: the
    // gate stays on "we do not know where you live" after the parent has just
    // said, the CTA stays dead, and the question is re-asked on the one path
    // that exists to clear it.
    onLocationConfirmed({
      countryCode: pick.location.country_code,
      name: localizedLocationName(pick.location, fields.locale),
    });
    void refreshProfile().catch(() => {
      // Nothing to say and nobody to say it to: the write landed, the panel is
      // already showing its outcome, and the next navigation rebuilds the
      // profile anyway.
    });
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
    regionGate: {
      gate: regionGate,
      locationName: homeLocationName,
      onSetLocation: () => setLocationDialogOpen(true),
    },
  };

  return (
    <>
      <SignupPanelView {...viewProps} />
      <SetLocationDialog
        open={locationDialogOpen}
        onOpenChange={setLocationDialogOpen}
        onSave={saveHomeLocation}
      />
      {/* Reusable family dialog — handles its own PIN gate (create/enter PIN)
          before showing the form, so no pre-check is needed here. On success
          we pre-select the new gamer; useCreateGamer invalidates the gamers
          query, so the child appears in the picker and resolves as selected. */}
      <AddGamerDialog
        open={addGamerOpen}
        onOpenChange={setAddGamerOpen}
        onCreated={fields.onSelectParticipant}
      />
    </>
  );
}
