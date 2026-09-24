"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type {
  GamerPhotoConsentType,
  MarketingConsentType,
  ProductBrowseRow,
} from "@/types";
import { AddGamerDialog } from "@/components/family";
import type { LocationPick } from "@/components/locations/location-picker-panel";
import { ROUTES } from "@/lib/constants";
import { pushGtmEvent } from "@/lib/gtm";
import { GTM_EVENTS } from "@/lib/gtm-events";
import { isAdvertisedProduct } from "@/lib/marketing-events";
import { localizedLocationName } from "@/lib/locations/localized-name";
import { useAuth } from "@/providers/auth-provider";
import { useSetMarketingConsent } from "@/services/marketing-consents";
import { useSetGamerPhotoConsent } from "@/services/gamer-photo-consents";
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
  /**
   * The photo consents this product's panel asks about — beside `product` for
   * the same reason again, and off the same detail-query embed.
   */
  gamerPhotoConsentTypes: readonly GamerPhotoConsentType[];
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
  gamerPhotoConsentTypes,
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
  //
  // **Nothing is read here to fill the optional boxes in, and there used to
  // be.** This panel made a keyed read of the parent's stored marketing answers
  // and seeded the boxes from it. Every optional box now starts unticked on
  // every enrolment (see the hook), so there is nothing for a read to seed —
  // which also means the panel makes one fewer call, and the preview twin and
  // the live panel now build their fields from identical arguments.
  const fields = useSignupPanelFields(
    product,
    authState,
    requiredConsentSlugs,
    marketingConsentTypes,
    gamerPhotoConsentTypes,
  );

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [addGamerOpen, setAddGamerOpen] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);

  const createMutation = useCreateParticipation();
  const waitlistMutation = useJoinWaitlist();
  const updateProfile = useUpdateProfile();
  const setMarketingConsent = useSetMarketingConsent();
  const setGamerPhotoConsent = useSetGamerPhotoConsent();

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
   * Where the marketing events say they happened: this product's own page, as a
   * concrete internal path rather than the `/shop/[id]` template.
   *
   * The event carries no product of its own, so the path is the only place the
   * product travels — collapsed to the template, every enrolment the shop has
   * ever taken arrives as one undifferentiated row, and the first question
   * anyone asks of the numbers ("which products are families signing up for?")
   * has no answer in them. It is also the shape our servers already state for
   * the same moments on the advertising side. And it is the shape `page_path`
   * is defined to carry, which every push obeys — a funnel is only drawn across
   * events that name their page the same way, so it forks at whichever step
   * decides for itself.
   *
   * That definition — which path, stated by whom, and why a product page is one
   * an event may name — is written once on `page_path` in `gtm-events.ts`.
   */
  const productPagePath = ROUTES.shopProductPath(product.id);

  /**
   * Whether this is a product we advertise — decided by the product's own two
   * columns, which the panel already holds as props.
   *
   * **It travels with the event and never suppresses it.** An advertising
   * platform is told only about advertised products, because a conversion for a
   * product nobody advertised is noise a campaign would be optimised against;
   * analytics is told about all of them, because leaving them out would make the
   * numbers disagree with our own database. Which vendor acts on the flag is a
   * per-tag decision in the container.
   */
  const advertised = isAdvertisedProduct(product);

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
   * **The optional answers, sent alongside the enrolment — one place, both
   * doors, both kinds of ask.**
   *
   * Called from the submit handler and the waitlist handler, because the parent
   * answered one panel and it would be indefensible for which button they
   * pressed to decide whether their answer was recorded.
   *
   * **Fire-and-forget, and that is a hard requirement rather than a shortcut.**
   * Nothing about this is allowed to block, delay or fail the enrolment: it is
   * not awaited, its outcome never touches `committing` or `submitError`, and a
   * rejection is logged and dropped. A parent who came to buy a seat must not
   * be told their purchase failed because a mailing-list preference or a photo
   * permission did — and neither answer is lost for good, since both questions
   * are waiting where the parent can answer them again (their settings, and the
   * child's page under My SOG).
   *
   * **Every box that was asked is answered, including the ones nobody
   * touched.** Nothing is seeded any more, so an untouched box is a "no" the
   * parent looked at rather than the absence of an answer, and sending only
   * what moved would drop the commonest answer on the panel. Both writers are
   * idempotent and append no event for a no-op, so re-stating an unchanged
   * answer costs a round trip and changes no record.
   *
   * The photo answers come with the participant they were given about, and the
   * hook hands over none at all when the seat being taken is the parent's own —
   * a consent about a gamer's image has no gamer to key to there.
   *
   * It runs at the click rather than on the enrolment's success, so an
   * enrolment that then fails still records what the parent said. That is the
   * right way round: the answers are about a mailbox and a child's image, not
   * about the seat, and a "no" in particular must not be conditional on a
   * purchase going through.
   */
  const recordConsentAnswers = () => {
    for (const answer of fields.marketingConsentAnswers) {
      setMarketingConsent.mutate(
        { ...answer, source: "enrolment" },
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
    const gamerId = fields.selectedParticipantId;
    // Structurally unreachable with an empty answer list — the hook withholds
    // the rows unless a participant is selected — and cheap insurance against
    // ever writing a photo answer with nobody to attach it to.
    if (gamerId === null) return;
    for (const answer of fields.gamerPhotoConsentAnswers) {
      setGamerPhotoConsent.mutate(
        { ...answer, gamerId, source: "enrolment" },
        {
          onError: (error) => {
            console.error(
              "[signup-panel] gamer photo consent write failed",
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
    recordConsentAnswers();
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
          // Handed to Stripe, and reported as exactly that. It is deliberately
          // not the enrolment event: a name is what an ad platform optimises on,
          // so reporting an abandoned checkout as an enrolment would teach it to
          // find people who *start* paying.
          //
          // The push itself is synchronous and lands before the assignment
          // below, so the event is in the queue whatever happens next. What a
          // tag then does with it is the tag's own business, and only one shape
          // of that survives an unload: a request sent with `sendBeacon`, which
          // is what GA4's tag uses. A tag that sends an ordinary fetch from here
          // may lose its leg to the navigation — a property of how the container
          // is configured, not something this call site can fix.
          pushGtmEvent({
            event: GTM_EVENTS.checkout,
            outcome: "sent_to_checkout",
            advertised,
            page_path: productPagePath,
          });
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
          //
          // **Both halves push, and neither is reported to an advertising
          // platform** — which looks like a contradiction and is the whole
          // point of the flag. Our servers tell an ad platform about neither a
          // municipality club nor anything invoiced off-platform, because a
          // conversion for a product nobody advertised is noise a campaign
          // would be optimised against. Analytics is a different question: both
          // halves are seats in our own database, and a count that quietly
          // dropped one of them would disagree with it. The two outcomes differ
          // only in how the council is invoiced, so reporting one and not the
          // other would under-count municipality enrolments for no reason a
          // reader of the numbers could ever discover. So the enrolment goes
          // out either way and `advertised` travels with it, and it is the
          // container that decides which tags read it.
          //
          // This path is a soft navigation, so the document survives the push
          // and a tag has as long as it likes.
          pushGtmEvent({
            event: GTM_EVENTS.enrolment,
            outcome: "enrolled",
            advertised,
            page_path: productPagePath,
          });
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
    recordConsentAnswers();
    waitlistMutation.mutate(
      {
        productId: product.id,
        participantId: fields.selectedParticipantId,
        consentedDocuments: consentedDocuments(),
      },
      {
        onSuccess: (response) => {
          // A place in the queue is a family committing to a product, which is
          // what the enrolment event names — reported under the same word as a
          // seat and told apart by its outcome.
          //
          // **Gated on exactly what the route gates its own reporting on**, and
          // that is the whole reason the flag crosses the wire. The RPC is
          // idempotent and answers a replay with the existing row, shape for
          // shape: a stale tab resubmitting, a browser retrying, or a second
          // parent joining a gamer who already holds a place all come back
          // looking like a fresh join. Pushing on those would count one place in
          // line several times over, and it would count exactly the cases the
          // server already refuses to report. The status check is the server's
          // other half: a fresh insert that comes back as anything but
          // `waitlisted` is a seat rather than a queue place, and must not be
          // reported as one.
          if (response.status === "waitlisted" && !response.idempotent) {
            pushGtmEvent({
              event: GTM_EVENTS.enrolment,
              outcome: "waitlisted",
              advertised,
              page_path: productPagePath,
            });
          }
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
