"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MarketingConsentType, ProductBrowseRow } from "@/types";
import { AddGamerDialog } from "@/components/family";
import type { LocationPick } from "@/components/locations/location-picker-panel";
import { ROUTES } from "@/lib/constants";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { useAuth } from "@/providers/auth-provider";
import {
  useMyMarketingConsents,
  useSetMarketingConsent,
} from "@/services/marketing-consents";
import {
  useCreateParticipation,
  useJoinWaitlist,
  type CreateParticipationInput,
} from "@/services/participations";
import { isConsentRefusal } from "@/services/participations/consent-refusal";
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
  /**
   * The consent documents enrolling on this product requires, as slugs.
   *
   * Beside `product` rather than on it: the requirement set is not a column on
   * the browse row, and it is not one on purpose — `BROWSE_SELECT` publishes
   * what a shop card paints and a card never names a product's enrolment
   * conditions. The detail page reads them off its own query's embed.
   */
  requiredConsentSlugs: readonly string[];
  /**
   * The marketing consents this product's panel asks about — beside `product`
   * for the same reason the slugs are, and off the same detail-query embed.
   */
  marketingConsentTypes: readonly MarketingConsentType[];
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

/**
 * What the panel says when an enrolment fails.
 *
 * Almost every refusal arrives as a sentence the database wrote for the parent
 * to read — registration has not opened, the waitlist is off — and the panel
 * shows it verbatim, which is the whole reason those two routes disclose their
 * messages at all. The consent refusal is the exception: the route replaces it
 * with a code (see `consent-refusal.ts`), the mutation hook answers by
 * refetching the product so the newly required document appears, and the line
 * beside the button falls back to the same generic one it already shows for
 * anything with no message of its own. There is deliberately no bespoke copy
 * for it — the useful half of the answer is the panel changing under the
 * reader, not a sentence explaining a race they did not see.
 */
function failureMessage(error: unknown, fallback: string): string {
  if (isConsentRefusal(error)) return fallback;
  return error instanceof Error ? error.message : fallback;
}

const signupErrorMessage = (error: unknown) =>
  failureMessage(error, "Could not sign up");
const waitlistErrorMessage = (error: unknown) =>
  failureMessage(error, "Could not join waitlist");

export function SignupPanel({
  product,
  requiredConsentSlugs,
  marketingConsentTypes,
  state,
  authState,
  regionGate,
  homeLocationName,
  onLocationConfirmed,
}: SignupPanelProps) {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();

  /**
   * What this parent's account already says about the consents this product
   * asks about — the seed for the optional boxes.
   *
   * **Switched off unless there is a question to seed and somebody to seed it
   * for.** The read is only correct for a signed-in customer, and on the
   * overwhelming majority of products there is no box for it to fill, so a
   * product asking nothing makes no call at all. It is a primary-key-prefixed
   * read of at most two rows on the products that do ask — near-instant, so the
   * panel renders the box immediately rather than waiting or drawing a
   * skeleton, and the tick arrives a frame or two later without moving
   * anything.
   */
  const { data: myMarketingConsents } = useMyMarketingConsents({
    enabled: authState.kind === "ready" && marketingConsentTypes.length > 0,
  });
  const seededMarketingConsents =
    myMarketingConsents === undefined
      ? undefined
      : new Set(
          myMarketingConsents
            .filter((row) => row.granted)
            .map((row) => row.consent_type),
        );

  // Pricing / gamer selection / agreed / locale+currency — the view props
  // shared verbatim with the preview panel. This panel only adds the live
  // mutation actions on top, so the demo can't drift from the real UI.
  const fields = useSignupPanelFields(
    product,
    authState,
    requiredConsentSlugs,
    marketingConsentTypes,
    seededMarketingConsents,
  );

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [addGamerOpen, setAddGamerOpen] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);

  const createMutation = useCreateParticipation();
  const waitlistMutation = useJoinWaitlist();
  const updateProfile = useUpdateProfile();
  const setMarketingConsent = useSetMarketingConsent();

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

  /**
   * The documents the parent agreed to, in the product's own order.
   *
   * The panel groups the required slugs into rows and asks about each row, but
   * the wire shape is the flat list either way: every row ticked means every
   * required document agreed to, so this is the required list itself — or
   * nothing at all while any row is outstanding, which the CTA already stops
   * from being sent. Read from the required list at click time rather than from
   * anything held beside it: each tick is stamped with the slugs its own row
   * covered (see `useSignupPanelFields`), so a requirement that changed under a
   * long-open tab has already dropped that row's tick, and this cannot send a
   * slug the parent was not shown. The RPC refuses a short list regardless,
   * which is the guarantee that matters.
   */
  const consentedDocuments = () =>
    fields.consentsAgreed ? [...fields.requiredConsentSlugs] : [];

  /**
   * **The optional marketing answers, sent alongside the enrolment — one place,
   * both doors.**
   *
   * Called from the submit handler and the waitlist handler, because the parent
   * answered one panel and it would be indefensible for which button they
   * pressed to decide whether their answer was recorded.
   *
   * **Fire-and-forget, and that is a hard requirement rather than a shortcut.**
   * Nothing about this is allowed to block, delay or fail the enrolment: it is
   * not awaited, its outcome never touches `committing` or `submitError`, and a
   * rejection is logged and dropped. A parent who came to buy a seat must not
   * be told their purchase failed because a mailing-list preference did — and
   * the answer is not lost either way, since the same question is waiting on
   * their settings page.
   *
   * **Nothing is sent when nothing changed**, which is the ordinary case: the
   * hook hands over only the boxes that now differ from what the account says.
   * The RPC is idempotent and would swallow a no-op, but its event log records
   * *changes*, and asking it to reject page-loads is the client making work out
   * of a question it already knows the answer to.
   *
   * It runs at the click rather than on the enrolment's success, so an
   * enrolment that then fails still records what the parent said. That is the
   * right way round: the answer is about their mailbox, not about the seat, and
   * a withdrawal in particular must not be conditional on a purchase going
   * through.
   */
  const recordMarketingAnswers = () => {
    for (const change of fields.marketingConsentChanges) {
      setMarketingConsent.mutate(
        { ...change, source: "enrolment" },
        {
          onError: (error) => {
            console.error(
              "[signup-panel] marketing consent write failed",
              error,
            );
          },
        },
      );
    }
  };

  const handleSubmit = () => {
    if (!fields.selectedParticipantId || !purchaseShape) return;
    setSubmitError(null);
    setCommitting(true);
    recordMarketingAnswers();
    const input: CreateParticipationInput = {
      productId: product.id,
      // The parent's own id when they picked their own row. The route pins
      // `p_customer_id` to the session user either way and the RPC's audience
      // gate is what decides whether the pair is allowed — nothing here has to
      // tell the two cases apart.
      participantId: fields.selectedParticipantId,
      purchaseShape,
      currency: fields.currency,
      consentedDocuments: consentedDocuments(),
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
        // Released on every error outcome, which is what makes the retry the
        // refetch below sets up actually clickable.
        setCommitting(false);
        setSubmitError(signupErrorMessage(err));
      },
    });
  };

  const handleJoinWaitlist = () => {
    if (!fields.selectedParticipantId) return;
    setSubmitError(null);
    setCommitting(true);
    recordMarketingAnswers();
    waitlistMutation.mutate(
      {
        productId: product.id,
        participantId: fields.selectedParticipantId,
        consentedDocuments: consentedDocuments(),
      },
      {
        onSuccess: (response) => {
          // Mirror the free-signup branch: land the parent on the summary
          // (waitlist variant). Keep `committing` set — the panel unmounts on nav.
          router.push(ROUTES.shopConfirmation(response.participationId));
        },
        onError: (err) => {
          setCommitting(false);
          setSubmitError(waitlistErrorMessage(err));
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
