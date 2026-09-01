"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Globe, MapPin, MapPinCheck, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import { Identicon } from "@/components/ui/identicon";
import { cn, formatCurrencyFromCents } from "@/lib/utils";
import { MAX_GAMERS_PER_PARENT, ROUTES } from "@/lib/constants";
import {
  consentDocumentMeta,
  describeRequiredConsents,
  type ConsentDocumentBundle,
  type RequiredConsentDisplayRow,
} from "@/lib/constants/consent-documents";
import {
  describeMarketingConsents,
  type MarketingConsentAskRow,
} from "@/lib/constants/marketing-consents";
import type { MarketingConsentType, ProductType } from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";
import { CountdownClock, useCountdownDone } from "./countdown-clock";
import type { RegistrationState } from "./derive-registration-state";
import { PricingPanelView } from "./pricing-panel-view";
import type { PricingOption } from "./pricing-options";
import { countryDisplayName, type RegionGate } from "./region-lock/region-gate";
import {
  SeatAvailabilityBar,
  type SeatAvailabilityBarProps,
} from "./seat-availability-bar";

// Top-level Signup Panel View. Pure presentational: takes resolved
// state and emits intent callbacks. Renders the right banner + body
// for the registration state, the pricing picker, and the form (or
// the auth overlay).
//
// Two clocks drive this panel and they run at different speeds. The CTA's
// pre-open → live flip rides a 1-second countdown *inside* the panel, so it
// lands on the second. The registration *state* is re-derived from `useNow()`,
// which ticks every 30 seconds — so for up to 29 seconds after registration
// opens, the panel is still being handed `closed_pre` while its own button has
// already gone live.
//
// That gap is why every signup-able state (closed_pre, pending_thr, open,
// full_waitlist) renders through ONE component, `SignupBody`. React keeps the
// same instance across a kind change, so the slower clock's swap reconciles in
// place instead of unmounting a panel and mounting a different one. It has to
// produce identical geometry as well as identical state: the seat bar is
// rendered by every one of those kinds whenever the product has a cap, and the
// countdown slot stays occupied for the rest of a mount that began during a
// countdown. Nothing in the panel moves after the clock hits zero — the parent
// hovering the button through the last five seconds is exactly who this is for.
//
// It also means the form-shaped variants genuinely reuse one `<SignupForm>`
// instance, so the selected gamer, the agreed checkbox and the pricing pick
// survive the flip and the sign-up really is one tap.

/**
 * One selectable row in the picker: a child, or — on a product sold to parents
 * — the reader themselves.
 *
 * The panel is deliberately id-agnostic about which is which. Everything that
 * makes a row work (selection, the identicon, the already-enrolled lockout) is
 * keyed on the id alone, and the participation-counts read is filtered on the
 * customer and keyed on the participant column, so a parent's own seat lands
 * under their own id with no service change. `isSelf` exists only for the two
 * places the *wording* has to change, never for the mechanics.
 */
export interface SignupParticipantChoice {
  id: string;
  name: string;
  age: number | null;
  /**
   * When set, this participant already holds a seat (`active`) or a waitlist
   * spot (`waitlisted`) on the product — the picker shows the row disabled and
   * labels its state in place instead of offering a second signup.
   */
  signupState?: MyParticipationState | null;
  /** True on the parent's own row. Selects the second-person copy, nothing else. */
  isSelf?: boolean;
}

export type AuthState =
  | { kind: "unauthenticated"; signInHref: string; createAccountHref: string }
  | { kind: "non_customer" }
  | {
      // A signed-in customer. `participants` may be empty — on a product with a
      // gamer audience the picker always renders an "Add a child" row, so the
      // zero-gamer case needs no separate state; it's just a picker with no
      // selectable rows yet.
      kind: "ready";
      participants: readonly SignupParticipantChoice[];
      /**
       * How many children the account holds — the number the add-a-child cap is
       * measured against, and deliberately NOT `participants.length`.
       *
       * On a for-parents product the parent's own row rides in the same array,
       * and counting it would hide the add affordance one child early: a family
       * at the cap minus one would be told they were full.
       */
      gamerCount: number;
    };

/**
 * Per-gamer signup state on a product: the child already holds a seat
 * (`active`) or a waitlist spot (`waitlisted`). The detail page derives this
 * from `useParticipationCounts(...).myGamerStates` and threads it onto each
 * gamer in the `ready` auth state.
 *
 * Those two are the only states that lock a child out of the picker. A parent
 * part-way through Stripe Checkout has no row at all — a paid seat is created
 * when the payment lands — so an abandoned checkout leaves the child selectable
 * and the parent simply clicks Sign Up again.
 */
export type MyParticipationState = "waitlisted" | "active";

/**
 * **The region lock, as this panel takes it.**
 *
 * A product may be sold in one country only, and every parent looking at a
 * locked one is told about it here — the family somewhere else, the family
 * whose location we do not know, and the family who is in it. The decision
 * itself is made outside and arrives as one discriminated value
 * (`region-lock/region-gate.ts`); the panel interprets it and owns nothing but
 * the rendering, which is what lets a preview scene drive it from fixtures.
 *
 * The callback is the section's own affordance and never the CTA's, and it
 * belongs to the one state that asks a question. Which state the gate is in
 * decides whether the reader sees a section, a statement in that same slot, or
 * an overlay where the form was — see the panel's grammar above `FormOrAuth`.
 *
 * The gate applies only to a signed-in customer's form. A signed-out visitor
 * meets the sign-in overlay first, and a wrong-role visitor the wrong-role
 * note: telling either of them where the product is sold answers a question
 * they have not reached yet.
 */
export interface SignupRegionGate {
  gate: RegionGate;
  /**
   * The family's home location as the reader's own locale spells it, read only
   * by the `eligible` variant — which states where the family lives, so that a
   * parent who has just answered the question can see *which* answer was
   * recorded.
   *
   * It sits beside the gate rather than inside it because the gate is a pure
   * decision over two country codes, and a place name is neither an input to
   * that decision nor derivable from it. Null when nothing has resolved a name;
   * the variant then makes its statement without naming a place.
   */
  locationName?: string | null;
  /** Opens the caller's set-location dialog. */
  onSetLocation: () => void;
}

/**
 * A home location the parent confirmed in the panel's own dialog, on its way
 * back up to whoever owns the gate.
 *
 * Both halves are what the panel's host needs and cannot get from the write it
 * just made: the country re-derives the gate before the keyed read of the row
 * lands, and the name is what the confirmation variant says back.
 *
 * **A pick whose row carries no country is still one of these**, with a null
 * code. The alternative — reporting nothing and letting the keyed read stay the
 * authority — leaves the gate saying "we do not know where you live" after the
 * parent has just told us, on the one path that exists to clear that question.
 * A confirmed null is a fact, and the gate fails it open exactly as it fails
 * open on a codeless row it read for itself.
 */
export interface ConfirmedHomeLocation {
  countryCode: string | null;
  /** Already resolved for the viewer's locale. */
  name: string;
}

export interface SignupPanelViewProps {
  productType: ProductType;
  /**
   * Whether the product is sold to children at all (`products.for_gamers`).
   *
   * False on a parents-only product, where two things follow: the add-a-child
   * affordance is withdrawn (offering to create an account that could not be
   * signed up here is a dead end), and the picker heading stops asking who is
   * being signed up — there is one answer and it is already selected.
   */
  forGamers: boolean;
  state: RegistrationState;
  authState: AuthState;
  /** The single purchase option for this product (one per type). */
  pricingOption: PricingOption;
  /**
   * Formatted date of the first charge, on a subscription whose billing is
   * deferred to a start date still ahead — null on everything else. Resolved by
   * `useSignupPanelFields` (which owns the projection); the panel only places
   * it, under the price it qualifies.
   */
  firstChargeDate?: string | null;
  /** Resolved by the adapter; null while nobody selectable is selected. */
  selectedParticipantId: string | null;
  onSelectParticipant: (participantId: string) => void;
  /** Opens the Add Gamer dialog (owned by the adapter). */
  onAddGamer: () => void;
  agreed: boolean;
  onAgreedChange: (next: boolean) => void;
  /**
   * **The product's enrolment conditions**: the published documents a parent
   * must agree to before a seat can be taken, as slugs. Empty on nearly every
   * product, and the whole consent section ceases to exist when it is.
   *
   * The list is settled before the panel paints — it rides in on the same
   * product read as the price and the schedule — so no checkbox can appear
   * under a parent part-way through the form.
   */
  requiredConsentSlugs: readonly string[];
  /**
   * Which of the consent rows those slugs group into the parent has ticked, by
   * row key.
   *
   * One entry per *bundle*, not per document: a programme's documents are handed
   * over together and cannot be accepted apart — a parent who agrees to the
   * terms but not the privacy policy has not met the product's conditions — so
   * one authored sentence names them all and one tick answers it. What earns a
   * second entry is a second bundle, or a slug belonging to no bundle at all.
   * Never seeded; see `useSignupPanelFields`.
   */
  consentAgreements: ReadonlySet<string>;
  onConsentAgreementChange: (rowKey: string, agreed: boolean) => void;
  /**
   * **The product's optional marketing asks**, as stored — the partners whose
   * mailing list this product offers a parent on the way past. Empty on nearly
   * every product, and the optional block ceases to exist when it is.
   *
   * Like the requirement set above, it rides in on the product read, so the
   * block's existence is settled before the panel paints. Unlike it, these
   * NEVER gate the CTA: a row here is a question the reader may decline, and a
   * declined question is a complete answer that leaves the seat untouched.
   */
  marketingConsentTypes: readonly MarketingConsentType[];
  /**
   * Which of those the reader has ticked, seeded from their account's own
   * stored answer and overlaid with anything they change here.
   *
   * The one thing on the panel whose value may legitimately change after first
   * paint on data's own schedule — the account read lands a round trip late —
   * and it is allowed to because only the *tick* moves. The box, its sentence
   * and its hint are all on screen from the first frame, so nothing shifts.
   */
  marketingConsents: ReadonlySet<MarketingConsentType>;
  onMarketingConsentChange: (
    consentType: MarketingConsentType,
    granted: boolean,
  ) => void;
  onSubmit: () => void;
  /** Separate from onSubmit — the waitlist branch calls this. */
  onJoinWaitlist: () => void;
  /** Mutation-state hint for disabling the CTA while in flight. */
  submitting?: boolean;
  /** Server-side error from the most recent submit. */
  submitError?: string | null;
  currency: SupportedCurrency;
  locale: string;
  /** See `SignupRegionGate`. Absent on every unlocked product. */
  regionGate?: SignupRegionGate;
}

// ---------- Why the panel is flat ----------
//
// The panel used to be a card, holding a card, holding a card per participant,
// and each layer spent padding: in the detail page's 20rem rail that left a row
// about 195px wide, which is not enough for a name, an age and "Already joined"
// on one line.
//
// What has no box is decided by one rule — **a border means you can act on
// it.** So the picker's outer box is gone (it is a grouping, not a control) and
// the pricing section has none (it is a statement of the price, with no choice
// attached), while the participant rows keep a border, because that border is
// what says "you can pick this"; the consent toggle keeps one, because it is a
// control; and the add-a-child affordance keeps one, because it is a button.
// The one deliberate exception is the region-lock family, whose three surfaces
// are bordered in the `info` hue whether or not they hold a control — that hue
// marks the subject speaking rather than the ability to act, and the full
// reasoning for spending the rule there lives on `RegionEligibleSection`.
//
// This was an opt-in variant while the rail was being judged and is now the
// only look, on single-column pages too. Nothing about what is rendered,
// selectable, disabled or announced ever depended on it.

export function SignupPanelView(props: SignupPanelViewProps) {
  switch (props.state.kind) {
    case "ended":
    case "running_late":
    case "full_closed":
      return <ClosedPanel productType={props.productType} />;
    // One component for every state with something to sign up on, so a state
    // change between them reconciles in place — see the note above. Listed
    // individually rather than as a `default` so a new kind has to be placed
    // here deliberately.
    case "closed_pre":
    case "pending_thr":
    case "open":
    case "full_waitlist":
      return <SignupBody {...props} />;
  }
}

// ---------- Shared shell ----------

// Every state shows the same calm header: the product's action noun
// (Enrolment / Registration / Sign-up / Joining) in muted grey — no per-state
// text or colour. The panel body (seat bar, pricing, CTA button, status notes)
// carries the state-specific signal instead, so the header never competes with
// it or repeats it.
function PanelShell({
  productType,
  children,
}: {
  productType: ProductType;
  children: React.ReactNode;
}) {
  const t = useTranslations("productDetail.signupPanel");
  return (
    <Card className="overflow-hidden">
      <div className="bg-muted px-5 py-2.5 text-center text-sm font-semibold text-muted-foreground">
        {t(`noun.${productType}`)}
      </div>
      <CardContent className="space-y-5 p-5 sm:p-6">{children}</CardContent>
    </Card>
  );
}

// ---------- Variant: Closed (ended / running late / full + no waitlist) ----------

// One shared panel for every "you can't sign up right now" dead end (ended,
// already started, or full with no waitlist). A parent never reaches these
// through a browse card — registrationCtaKind marks them inert, so the card
// they came from is not a link — the only way in is a stale link or bookmark.
// That makes three bespoke layouts not worth maintaining, and the exact reason
// not worth spelling out: they collapse to one generic note, no actionable CTA.
// (The RegistrationState kinds stay distinct — the card layer still needs them;
// only the panel rendering merges.)
//
// This is the one swap that still changes the panel's shape: a product whose
// last seat goes in the seconds between the drop and the state catching up
// lands here, and there is nothing to preserve — the form, the CTA and the
// countdown all cease to exist, because there is no longer anything to do. A
// panel that held their geometry open would be reserving space for a control
// that can never come back, which is the other way to get the layout rule
// wrong. Something different is simply there now.
function ClosedPanel({ productType }: { productType: ProductType }) {
  const t = useTranslations("productDetail.signupPanel");
  return (
    <PanelShell productType={productType}>
      <p className="text-sm text-muted-foreground">{t("closedNote")}</p>
    </PanelShell>
  );
}

// ---------- Variant: everything with something to sign up on ----------

/**
 * What the seat bar shows for a state, or `null` when there is no bar to draw.
 *
 * Every capped state answers with a bar, which is the point: the bar's box is
 * settled before registration opens, so the 30-second variant swap can't push
 * the CTA down. A `full_waitlist` product reads "0 of N remaining" with the
 * waitlist chip — the same capacity story, told at its end — and the "how the
 * waitlist works" detail lives on the post-join summary instead ("what happens
 * next").
 *
 * `seatsLeft ?? seatCount` is type narrowing only: the seat trio types
 * `seatsLeft` as nullable, and it is null exactly when `seatCount` is — the
 * branch above has already excluded that.
 */
function seatBarFor(state: RegistrationState): SeatAvailabilityBarProps | null {
  switch (state.kind) {
    case "closed_pre":
    case "pending_thr":
    case "open":
      if (state.seatCount === null) return null;
      return {
        seatCount: state.seatCount,
        seatsLeft: state.seatsLeft ?? state.seatCount,
        waitlistEnabled: state.waitlistEnabled,
      };
    case "full_waitlist":
      return { seatCount: state.seatCount, seatsLeft: 0, waitlistEnabled: true };
    case "ended":
    case "running_late":
    case "full_closed":
      return null;
  }
}

function SignupBody(props: SignupPanelViewProps) {
  const t = useTranslations("productDetail.signupPanel");
  const verb = useVerb(props.productType);
  const activeLabel = useActiveCtaLabel(
    verb,
    props.pricingOption,
    props.currency,
    props.locale,
  );

  // Aliased so the narrowing survives: TypeScript follows a discriminant
  // through a `const` local, not through a property of a parameter.
  const state = props.state;
  const isPreOpen = state.kind === "closed_pre";
  const opensAtMs = isPreOpen ? new Date(state.opensAt).getTime() : null;

  // Whether this mount started during a countdown, remembered for the life of
  // the mount. Once the 30-second clock re-derives the state as `open`, the
  // component is handed a state with no `opensAt` on it — but the four cells
  // are on screen and must stay there, so the slot is held from here rather
  // than from the current state. A page loaded when registration was already
  // open has no cursor mid-hover and no cells to preserve, so it gets none.
  const [countdownAtMount] = useState(opensAtMs);
  const countdownDone = useCountdownDone(opensAtMs);

  // The CTA goes live on the 1-second countdown, ahead of the state swap, and
  // stays live after it. Every other signup-able state is live on arrival — so
  // this one boolean is both "the button works" and "the clock has finished",
  // which are the same fact read from either end.
  const active = !isPreOpen || countdownDone;
  const isWaitlist = state.kind === "full_waitlist";
  const seatBar = seatBarFor(state);

  return (
    <PanelShell productType={props.productType}>
      {seatBar !== null && <SeatAvailabilityBar {...seatBar} />}
      <PricingPanelView
        option={props.pricingOption}
        currency={props.currency}
        locale={props.locale}
        firstChargeDate={props.firstChargeDate ?? null}
      />
      <FormOrAuth
        {...props}
        // The prep checklist in SignupForm runs the same whether or not
        // registration is open yet, so a parent can finish every step during the
        // countdown. `active` only gates the final leaf: until the clock hits
        // zero a fully-prepped parent sees "Ready & waiting"; at zero it flips
        // in place to the live action label.
        onSubmit={isWaitlist ? props.onJoinWaitlist : props.onSubmit}
        ctaLabelActive={isWaitlist ? t("ctaWaitlist") : activeLabel}
        active={active}
        variant={isWaitlist ? "secondary" : "default"}
      />
      {/* The countdown outlives its own countdown. At the target instant it
          switches to `done`, which keeps the four cells exactly where they are
          and renders them as `--`; when the state swap arrives up to 29
          seconds later, `countdownAtMount` keeps them rendered still.
          Unmounting them at either moment would shrink the panel — and because
          the panel is sticky on desktop and reflows on mobile, that shrink
          propagates outward (page section height changes, the sticky bottom
          anchor pulls content up) and the Sign-up button moves under the
          parent's cursor at the exact second they meant to click it. */}
      {countdownAtMount !== null && (
        <CountdownClock targetMs={countdownAtMount} done={active} />
      )}
    </PanelShell>
  );
}

// ---------- Form / Auth overlay ----------

interface FormOrAuthProps extends SignupPanelViewProps {
  /**
   * The CTA's *enabled* label — the live action ("Enrol now · €45/mo", "Join
   * the waitlist") shown once every prep step is done and registration is open.
   * Every disabled step (add a gamer, agree to the rules, "Ready & waiting")
   * is resolved centrally in SignupForm, so there's no separate idle label.
   */
  ctaLabelActive: string;
  active: boolean;
  variant?: "default" | "secondary";
}

// ---------- The panel's grammar ----------
//
// Four rules the whole panel obeys, so that a new state is answered with a
// shape the reader has already learned rather than a new kind of control.
//
// **The CTA has exactly two live behaviours: submit and join-waitlist.** Submit
// leads to Stripe Checkout, or straight to the confirmation summary where there
// is nothing to charge; the waitlist join lands on that same summary. It never
// navigates anywhere else and never opens a dialog.
//
// **A disabled CTA is an instruction.** It names the single next missing step,
// in the order the sections stand on the page: add a gamer → set your location
// → give the required consent → wait for the window. The label points at the
// nearest unfinished thing above the button, so following it is a walk down the
// panel rather than a hunt.
//
// **Everything a parent has to agree to lives in ONE section, and it is the last
// one before the button.** Consent is a single heading holding one tickable row
// per thing being agreed to: the product's own documents when it attaches any,
// and — always, at the bottom — our rules. They are the same control in the same
// box, because they are the same act, and the CTA therefore names one step
// rather than walking a reader through two headings that look alike. A new thing
// to agree to becomes another row in this section, above the rules row; it does
// not become a section of its own.
//
// **One consent row carries a marker, and it is the one that does NOT gate the
// button.** The optional marketing row below the section is the same bordered
// control as the gates above it — the border draws the click target, not the
// stakes — so its info-toned hint sentence, which opens with the word
// "Optional", is what a reader (and, through `aria-describedby`, a screen
// reader) tells them apart by. Every gate is unmarked, because a gate is the
// ordinary thing to find here.
//
// **Actions live in the sections, never in the CTA.** A section that needs
// something offers its own affordance: the dashed add-a-gamer row inside the
// picker, the set-location button inside the location section.
//
// **A full-panel overlay means ineligibility** — signed out, signed in as a
// gamer or a gedu, in a country this product is not sold to. There is no
// decision for that reader, so none is presented: no picker, no consent, no
// button. The converse is what binds future states — a visible form promises
// this reader can reach a purchase from here.
function FormOrAuth(props: FormOrAuthProps) {
  switch (props.authState.kind) {
    case "unauthenticated":
      return (
        <UnauthenticatedOverlay
          productType={props.productType}
          signInHref={props.authState.signInHref}
          createAccountHref={props.authState.createAccountHref}
        />
      );
    case "non_customer":
      return <NonCustomerOverlay forGamers={props.forGamers} />;
    case "ready":
      // A family in the wrong country is ineligible, so the form goes — the
      // same swap the wrong-role note above makes, with picker, consent and CTA
      // ceasing to exist rather than being disabled in place. Nothing on screen
      // survives it, so nothing moves and nothing needs room reserved.
      //
      // **This applies to a family already enrolled, and that is decided rather
      // than overlooked.** The overlay replaces the whole panel, the
      // already-joined picker row included, so a family that moves after buying
      // a seat is shown no acknowledgement of it here. Nothing about the seat is
      // touched: the product they own stays on their own dashboard, keyed by the
      // participation, which is the surface for what a family already has. What
      // they lose is the ability to buy *further* seats until their location
      // matches again, which is the gate doing its job — it gates entrance, and
      // an enrolment is an entrance.
      if (props.regionGate?.gate.kind === "wrong_country") {
        return (
          <WrongCountryOverlay
            requiredCountry={props.regionGate.gate.requiredCountry}
            locale={props.locale}
          />
        );
      }
      // selectedParticipantId comes through `props` (it's a top-level View prop,
      // not part of the AuthState union — see SignupPanelViewProps).
      return (
        <SignupForm
          {...props}
          participants={props.authState.participants}
          gamerCount={props.authState.gamerCount}
        />
      );
  }
}

function UnauthenticatedOverlay({
  productType,
  signInHref,
  createAccountHref,
}: {
  productType: ProductType;
  signInHref: string;
  createAccountHref: string;
}) {
  const t = useTranslations("productDetail.signupPanel");
  return (
    /* The app-wide button order shape — root `CLAUDE.md`, "Button Order":
       DOM [secondary, primary] under `flex-col-reverse`, so signing in reads
       on top. This pair only ever stacks, so there is no `sm:flex-row` half.
       The rendered order is what it has always been; only the authoring
       shape changed, so the whole app states this one way round. */
    <div className="flex flex-col-reverse gap-2">
      <Link
        href={createAccountHref}
        className={buttonVariants({
          size: "lg",
          variant: "outline",
          className: "w-full text-base",
        })}
      >
        {t("ctaCreateAccount")}
      </Link>
      <Link
        href={signInHref}
        className={buttonVariants({
          size: "lg",
          className: "w-full text-base",
        })}
      >
        {/* Keyed by type like the panel's other action words, so this button can
            name the action the signed-in CTA will. Only the event mismatch is
            fixed here — it said "register" where every other word on an event
            panel says "join". Clubs and camps still pair "Enrol"/"Sign up" with
            "Sign in to register"; that is left as-is on purpose, as a copy
            decision to make on its own rather than a mechanical sweep. */}
        {t(`ctaSignIn.${productType}`)}
      </Link>
    </div>
  );
}

// The signed-in-but-wrong-role note (a gamer or a gedu on a shop URL). The
// gamers-only wording names what this page is for — registering a gamer — which
// on a parents-only product would be describing the wrong product, so that case
// says the same thing about the seat instead of about a child.
function NonCustomerOverlay({ forGamers }: { forGamers: boolean }) {
  const t = useTranslations("productDetail.signupPanel");
  return (
    <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
      {forGamers ? t("nonCustomerNote") : t("nonCustomerNoteParents")}
    </p>
  );
}

/**
 * The product is not sold where this family lives.
 *
 * **Louder than the wrong-role note beside it, and on purpose.** The two look
 * like the same thing — a statement where the form was — but they are met by
 * different readers. A gedu or a gamer on a shop URL already knows they are not
 * the audience; the note only confirms it, so a muted line is right. A parent
 * who came to buy does not know, and an inert panel with a small grey line
 * under it reads as a page that failed to load. This is the whole answer they
 * get, so it is sized like one.
 *
 * **Info, not warning and not error.** Nothing has gone wrong and nothing is
 * their fault: the product is sold somewhere else, which is a fact about the
 * product. So the tint is the `info` semantic pair, never `destructive` or
 * `warning` (which would tell them to fix something) and never `primary`
 * (which is the panel's *act on this* colour, and there is nothing to act on).
 * The `Globe` anchors it — the same subject the sections' `MapPin` /
 * `MapPinCheck` mark, one scale up because this block is the panel's entire
 * content.
 *
 * **All three region-lock surfaces speak in the `info` hue, at two volumes.**
 * The refusal, the question and the confirmation are one subject told at three
 * moments, so a parent who meets two of them in one visit — asked for a
 * location, then told it fits — should recognise the second as the same voice
 * as the first. The shared voice is the `info` border, an `info`-coloured
 * lucide anchor and body text at full foreground weight. Volume follows
 * stakes: this refusal replaces the form and is the one thing on the panel, so
 * it alone fills its surface with the tint; the two in-form sections sit
 * inside a form the parent is actively using, so they carry the hue on the
 * border alone (the same quiet-info tier the enrollment card's "awaiting"
 * state established) and leave the form the loudest thing on its own panel.
 *
 * The country is named, in the reader's own language and in the sentence's only
 * weighted words: it is the one fact the reader needs and the one they will
 * scan for. A refusal that will not say what it is refusing on leaves them with
 * nothing to understand — and the lock is not a secret, it is where the product
 * is sold. What the sentence pointedly does not do is mention that a location
 * is a settings field they could change: the block is a statement about who the
 * product is offered to, not a puzzle with a published solution.
 *
 * It keeps the panel's container geometry — one block in the slot the form
 * occupied, no wider and no taller than its own content — so the rail around it
 * is the rail every other state draws.
 */
function WrongCountryOverlay({
  requiredCountry,
  locale,
}: {
  requiredCountry: string;
  locale: string;
}) {
  const t = useTranslations("productDetail.signupPanel");
  return (
    <div className="flex items-start gap-3 rounded-md border border-info bg-muted p-4">
      <Globe className="mt-0.5 h-5 w-5 shrink-0 text-info" />
      <p className="text-sm text-foreground">
        {t.rich("regionLock.wrongCountry", {
          country: countryDisplayName(requiredCountry, locale),
          name: (chunks) => <span className="font-semibold">{chunks}</span>,
        })}
      </p>
    </div>
  );
}

/**
 * The family's location is missing, and this is where they supply it.
 *
 * A section of the form like the picker and the rules, in the order the CTA
 * names them: it sits between the two, so "Set your location" points at the
 * thing directly above the button once a participant is chosen. It is a
 * *question*, not a refusal — the form around it stays whole and every other
 * step can still be finished first — which is why the copy asks where the
 * family lives without naming the country that would unlock the page. Naming it
 * would turn the question into a hint.
 *
 * The affordance is the picker's dashed add-a-gamer row, in the second place
 * the panel needs the same grammar: a bordered, full-width, secondary-weight
 * button that opens a dialog, sitting inside the section it is about rather
 * than in the CTA.
 *
 * **It speaks in the refusal's hue at the quiet volume, because it is about
 * the same thing.** The `info` border says "this product is a bit different
 * and wants your attention" without ever saying anything is wrong — which is
 * exactly the question being asked — while the default background keeps a
 * section inside a working form from shouting over the form itself. The
 * border is the whole change: the heading, the note and the button sit where
 * they always sat, in the order they always sat in, so the section still
 * reads as one step of the form rather than as an interruption of it.
 *
 * **The block's `MapPin` anchors the section, and the button's does not.** The
 * heading carries an `info`-coloured pin, the way the refusal's `Globe` and the
 * confirmation's `MapPinCheck` anchor theirs — that glyph is what makes the
 * three read as one voice, and it belongs on the thing that is speaking. The
 * pin inside the button is a second thing: it labels an action, so it inherits
 * `currentColor` and rides the button's own muted→foreground hover with the
 * label beside it. Leaving the family's hue on it would have painted the one
 * actionable element in the section the colour that means "this is the region
 * lock talking", and left the block itself unmarked.
 */
function RegionLocationSection({ onSetLocation }: { onSetLocation: () => void }) {
  const t = useTranslations("productDetail.signupPanel");
  return (
    <div className="rounded-md border border-info p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <MapPin className="h-4 w-4 shrink-0 text-info" />
        {t("regionLock.heading")}
      </h3>
      {/* Indented to the heading's text, not its glyph: gap-2 (0.5rem) plus a
          1rem icon is exactly pl-6, the same alignment the confirmation's
          receipt line uses. */}
      <p className="mt-1 pl-6 text-xs text-foreground">{t("regionLock.note")}</p>
      <button
        type="button"
        onClick={onSetLocation}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-input px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent hover:text-foreground"
      >
        <MapPin className="h-4 w-4" />
        {t("regionLock.setLocation")}
      </button>
    </div>
  );
}

/**
 * The family's location is known, and it is where this product is sold.
 *
 * The same slot the question occupied, answered — which is the point of putting
 * it there. A parent who confirms a matching place in the dialog watches the
 * section they were asked to fill in state the outcome in its place, which is
 * how they learn the save worked without a toast or a reloaded page. The
 * transform is the direct result of the confirm they just made, so the reflow
 * below it is one the reader is braced for.
 *
 * **It says something worth saying to the people it is true for, in their own
 * direction.** The refusal says the product is only offered somewhere else;
 * this leads with the special-ness and lands on belonging — just for families
 * in your country, and you are one. Same fact, two speech acts — and the
 * exclusionary wording that is exactly right for the blocked reader reads as a
 * hedge to the one who is already in, which is why they are two message keys
 * rather than one shared string. Both name the country in *label* position,
 * after a colon, because a display name inflected into a sentence would need an
 * article in English and a case ending in Finnish that `Intl` does not supply.
 * The receipt line
 * beneath does the "that's you" work in the reader's own place name, which is
 * what lets the sentence above it stay a short, warm fragment. What it does not
 * do is invite an edit: there is no change-location control, because a parent
 * halfway through a purchase should not be nudged into rewriting a profile
 * field, and settings is where a location is changed. That absence is also what
 * keeps this out of the CTA's checklist — an eligible family has nothing left to
 * do here, so the button is untouched.
 *
 * **It carries the region-lock family's `info` surface, which is the one place
 * this panel's "a border means you can act on it" rule is deliberately spent.**
 * What is bought with it is not inactionability — the ask section wears the
 * same border and holds a button — but *subject*: the info hue says "the region
 * lock is speaking", and it says that about all three surfaces regardless of
 * whether there is anything to do on them. Controls keep announcing themselves
 * the way they do everywhere else on the panel, from inside the block: the ask
 * section's affordance is a bordered, full-width button that looks exactly like
 * the picker's add-a-gamer row, and its absence here is what tells a reader this
 * block is a statement. So the two are told apart by what is *in* the block, not
 * by whether the block has an edge — which is the trade this exception makes,
 * and the reason a bordered statement in the slot a bordered *question*
 * occupied a moment ago is the point rather than a cost: the question becoming
 * its own answer in place is the whole transform. A borderless confirmation next
 * to a bordered refusal and a bordered ask would have read as a third kind of
 * thing.
 */
function RegionEligibleSection({
  requiredCountry,
  locationName,
  locale,
}: {
  requiredCountry: string;
  locationName: string | null;
  locale: string;
}) {
  const t = useTranslations("productDetail.signupPanel");
  return (
    <div className="rounded-md border border-info p-4">
      <p className="flex items-start gap-2 text-sm text-foreground">
        <MapPinCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <span>
          {t("regionLock.eligible", {
            country: countryDisplayName(requiredCountry, locale),
          })}
        </span>
      </p>
      {/* Only when a name actually resolved. A line reading "Your family's
          location:" with nothing after it would be worse than not saying where
          they live. */}
      {locationName !== null && (
        <p className="mt-1 pl-6 text-xs text-muted-foreground">
          {t("regionLock.eligibleLocation", { location: locationName })}
        </p>
      )}
    </div>
  );
}

function SignupForm(
  props: FormOrAuthProps & {
    participants: readonly SignupParticipantChoice[];
    gamerCount: number;
  },
) {
  const t = useTranslations("productDetail.signupPanel");
  // The "Add Gamer" row reuses the family namespace's label so the wording
  // stays in lockstep with the family selector / My Gamers tile.
  const tFamily = useTranslations("family");
  // Two independent reasons to withhold the add affordance. Steven Brown Rule —
  // hidden at the cap, same as the family selector / My Gamers grid; the count
  // is the parent's full roster (enrolled children included) and comes in
  // separately precisely because `participants` may carry the parent's own row,
  // which is not a child and must not count against the cap. And a
  // parents-only product has no gamer audience at all, so adding a child here
  // would create an account that cannot be signed up on this page.
  const canAddGamer =
    props.forGamers && props.gamerCount < MAX_GAMERS_PER_PARENT;
  const selectedIsSelf =
    props.participants.find((p) => p.id === props.selectedParticipantId)
      ?.isSelf === true;
  // Two of the four gate states put a section in the form, and only one of them
  // stops the CTA. The wrong-country half never reaches this component — it
  // replaced the form upstream — and `unlocked` renders nothing at all.
  const needsLocation = props.regionGate?.gate.kind === "no_location";
  // The product's documents, grouped the way the parent will meet them: one row
  // per bundle, plus a row for anything belonging to no bundle. Derived here
  // rather than taken as a prop so the gate below and the rows on screen cannot
  // disagree — an unticked row a reader can see always blocks the button.
  const consentRows = describeRequiredConsents(props.requiredConsentSlugs);
  // Vacuously true on the products that require nothing, which is nearly all of
  // them — so this step costs the ordinary panel nothing and does not appear in
  // its CTA checklist at all.
  const consentsSatisfied = consentRows.every((row) =>
    props.consentAgreements.has(row.key),
  );
  const formReady =
    props.selectedParticipantId !== null &&
    props.agreed &&
    consentsSatisfied &&
    !needsLocation;
  const clickable = formReady && props.active && !props.submitting;

  // The CTA doubles as the instruction for the parent's next step: while it's
  // disabled it names exactly what's still missing, in the order they can act
  // on it (add a gamer → set your location → agree to the rules → agree to the
  // documents → wait for the window), which is the order the sections stand in
  // on the page. The same
  // checklist runs whether or not registration is open, so a parent can finish
  // every step during the pre-open countdown and land on "Ready & waiting",
  // primed to one-tap the instant it opens. Only the final leaf differs by
  // window: the live action label once open (`active`), the holding state until
  // then. selectedParticipantId is null only when nobody is selectable: there
  // is still room to add a child (canAddGamer → prompt to add a gamer), every
  // child is already on the product at the gamer cap, or — on a parents-only
  // product — the reader already holds the one seat there is. The latter two
  // both land on ctaAllSet; the picker rows show each person's exact
  // seat/waitlist status in place.
  //
  // The location step is an instruction and nothing more — the button stays
  // disabled and the section above it carries the action, per the grammar note
  // by `FormOrAuth`.
  const ctaLabel = props.submitting
    ? t("ctaSubmitting")
    : props.selectedParticipantId === null
      ? canAddGamer
        ? t("ctaAddGamer")
        : t("ctaAllSet")
      : needsLocation
        ? t("regionLock.setLocation")
        : // One leaf for the whole consent section, whatever is unticked inside
          // it. Two labels would have made the reader's next move ambiguous —
          // both boxes sit under one heading and look identical, so "agree to
          // the rules" would be pointing at a row the reader cannot tell from
          // the one above it. The section is what they act on, so the section
          // is what the button names.
          !consentsSatisfied || !props.agreed
          ? t("ctaAgreeConsent")
          : props.active
            ? props.ctaLabelActive
            : t("ctaReadyWaiting");

  return (
    <div className="space-y-4">
      {/* No box around the picker — it is a grouping, not a control, and the
          heading below marks the section without a container around it. See
          the border-means-interactive note above. */}
      <div>
        <h3 id="gamer-picker-label" className="text-sm font-semibold">
          {/* Per-type heading — matches the product's action verb
              (enrol / register / sign up / join). A parents-only product has
              exactly one answer and it is already selected, so the heading
              states the seat rather than asking a question with no second
              option; it stays type-neutral because the verb it would carry
              belongs to the question it is no longer asking. */}
          {props.forGamers
            ? t(`whoAreYouSigningUp.${props.productType}`)
            : t("seatIsFor")}
        </h3>
        <div className="mt-3 space-y-2">
          <div
            role="radiogroup"
            aria-labelledby="gamer-picker-label"
            className="space-y-2"
          >
            {props.participants.map((g) => {
              // A participant already holding a seat / waitlist spot can't be
              // signed up again — the row is disabled and labels its state in
              // place rather than offering itself for selection. This covers the
              // parent's own row for free: the counts read is filtered on the
              // customer and keyed on the participant column, so a self seat
              // arrives under the parent's own id like any other.
              const alreadyOn = g.signupState ?? null;
              const selected = props.selectedParticipantId === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={alreadyOn !== null}
                  onClick={() => props.onSelectParticipant(g.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2.5 text-sm transition-colors",
                    // The border and the fills stay: this row is the one thing
                    // in the picker you can act on, and the border is what says
                    // so. With no box around the group the row spends a little
                    // less on its own padding (22px of horizontal cost) and
                    // gives the name/age/status line the room it needs at rail
                    // width.
                    alreadyOn !== null
                      ? "cursor-not-allowed border-input bg-muted/40 opacity-60"
                      : selected
                        ? // With no outer box to sit inside, a 1px primary
                          // border against a 1px input border is a thin
                          // distinction. An inset ring doubles the line without
                          // changing the box, so selecting a row cannot nudge
                          // its own text by a pixel. Both lines are amber at its
                          // authored value and the lift is a neutral token —
                          // brand edge, neutral lift, like every other selected
                          // row in the app.
                          "border-primary bg-accent ring-1 ring-inset ring-primary"
                        : "border-input hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md">
                      <Identicon id={g.id} />
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "font-medium",
                          alreadyOn !== null && "text-muted-foreground",
                        )}
                      >
                        {g.name}
                      </span>
                      {/* The slot beside the name says who this row is: a
                          child's age, or the word "Parent" on the reader's own
                          row — same position, same weight, so the picker reads
                          uniformly whoever is in it. */}
                      {g.isSelf === true ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t("parentPill")}
                        </span>
                      ) : (
                        g.age !== null && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {t("agePill", { age: g.age })}
                          </span>
                        )
                      )}
                    </span>
                  </span>
                  {alreadyOn !== null ? (
                    <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                      {alreadyOn === "active"
                        ? t(`gamerAlreadySignedUp.${props.productType}`)
                        : t("gamerAlreadyWaitlisted")}
                    </span>
                  ) : (
                    selected && (
                      <span className="shrink-0 text-xs font-semibold text-primary">
                        {t("selected")}
                      </span>
                    )
                  )}
                </button>
              );
            })}
          </div>
          {/* "Add Gamer" row — opens the reusable AddGamerDialog (owned by the
              adapter). This is why there's no separate no-gamers state: zero
              gamer rows above + this row is the empty case. It's an action, not
              a radio option, so it sits OUTSIDE the radiogroup above — a
              radiogroup must contain only its radios, or assistive tech mis-
              announces the count and arrow-key navigation lands on a non-choice.
              Hidden at the Steven Brown cap, matching every other add-gamer
              affordance. */}
          {canAddGamer && (
            <button
              type="button"
              onClick={props.onAddGamer}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-input px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              {tFamily("addGamer")}
            </button>
          )}
        </div>
      </div>

      {/* One slot between the picker and the rules, which is where the CTA's
          checklist names it, and which both locked-and-signed-in states share.
          It is present from the panel's first paint and stays whatever it was:
          the page either waits for the country before painting, or resolves the
          gate without it and *latches* that — so a read landing late cannot
          push this slot into existence, or out of it, under a reader who is
          part-way through the form. The only later change is the question
          becoming its own answer in place, which is a confirm they just made. */}
      {needsLocation && props.regionGate !== undefined && (
        <RegionLocationSection onSetLocation={props.regionGate.onSetLocation} />
      )}
      {props.regionGate?.gate.kind === "eligible" && (
        <RegionEligibleSection
          requiredCountry={props.regionGate.gate.requiredCountry}
          locationName={props.regionGate.locationName ?? null}
          locale={props.locale}
        />
      )}

      <RequiredConsentSection
        productType={props.productType}
        selfSeat={selectedIsSelf}
        rows={consentRows}
        agreements={props.consentAgreements}
        onAgreementChange={props.onConsentAgreementChange}
        rulesAgreed={props.agreed}
        onRulesAgreedChange={props.onAgreedChange}
      />

      {/* Below the conditions and above the button: the last thing on the panel
          before the CTA, and deliberately NOT a row inside the section above.
          See the component's own note — the section above is one act the button
          names, and this question does not gate it. What tells the two apart is
          its own info-toned hint sentence, not the treatment of the box. Its
          existence comes off the product read, so it is here or absent from the
          first paint; only its tick arrives late. */}
      <OptionalMarketingSection
        rows={describeMarketingConsents(props.marketingConsentTypes)}
        granted={props.marketingConsents}
        onGrantedChange={props.onMarketingConsentChange}
      />

      <Button
        size="lg"
        variant={props.variant ?? "default"}
        className="w-full text-base"
        disabled={!clickable}
        onClick={props.onSubmit}
      >
        {ctaLabel}
      </Button>

      {props.submitError && (
        <p className="text-xs text-destructive" role="alert">
          {props.submitError}
        </p>
      )}
    </div>
  );
}

/**
 * **Everything a parent has to agree to, under one heading.**
 *
 * One section, always present, holding one tickable row per thing being agreed
 * to: the product's own required documents when it attaches any, and — always,
 * last — our rules. Both rows are the same control, a bordered clickable box
 * that lights when ticked, because they are the same act. The heading names the
 * act rather than the paperwork ("Consent"), which is also what the disabled
 * CTA points at, so a reader following the button lands on a section rather
 * than on one of two boxes they cannot tell apart.
 *
 * **The heading says "Consent" and not "Required consent", because the rows
 * below it are no longer the only consent rows on the panel.** The optional
 * marketing row sits just outside this section wearing the same border, so a
 * heading claiming "required" would be the only thing separating them and it
 * would sit above one of the two rather than on either. The distinction lives on
 * the rows instead — and on exactly one of them: the optional row carries the
 * word, every gate carries nothing.
 *
 * **The rules row carries no heading of its own.** It used to be its own titled
 * section, and beside a second titled section of identically-shaped boxes that
 * title stopped meaning anything: two headings, two boxes, one act. What the
 * heading was doing — giving the CTA's prompt a visible referent — is now done
 * by the section's own, so the row is left to be a sentence and a checkbox. Like
 * every gate here it carries no marker: it sits in the same stack, under the
 * same heading, at the same spacing, and it gates the CTA exactly as they do.
 *
 * **And its sentence names its own document, exactly as a bundle's does.** The
 * rules row is a consent to our Anti-Bullying and Discipline policy, so the
 * words that name that policy are the link to it — the reader can read what
 * they are being asked to agree to from inside the box that asks. Every row in
 * the section therefore behaves the same way, which is the point: a parent must
 * not be able to tell our rules from a product's documents by their treatment.
 *
 * **One checkbox per bundle, not per document — and the sentence IS the
 * consent.** A programme hands its terms and its privacy policy over together
 * and they cannot be accepted apart — a parent who agreed to one and not the
 * other has not met the conditions and cannot enrol — so the pair is one row,
 * and its label is one authored sentence naming both documents inline, each
 * name a link. The database still records one acceptance row per document
 * against its own version; that is the server's bookkeeping of one act, and it
 * does not need a control each.
 *
 * **Inline, rather than a list of links above a generic "I agree to these
 * documents".** What a parent is agreeing to is a sentence, and a sentence that
 * points at its own documents by name is the thing they can actually read back
 * to themselves. The cost is that each bundle's sentence is authored per
 * locale with its own fixed named tags — and that is the point rather than the
 * price: no locale has to format a variadic list of document names into a
 * grammatical sentence, because every locale simply writes one.
 *
 * **The links are inside the clickable box, and a click on one reads rather
 * than ticks.** That is not a handler, it is the DOM: a `<label>`'s activation
 * behaviour is skipped outright when the click lands on an interactive
 * descendant, and an `<a href>` is one — so the link navigates and the box does
 * not toggle, in every engine and in jsdom. Nothing on the box listens for
 * clicks itself, so there is nothing for an anchor to `stopPropagation` away
 * from; adding one would buy no safety here and would silently break any
 * delegated listener an ancestor later wants. A row that grows its own
 * `onClick` is the moment to revisit that, and the tests pin which mechanism is
 * doing the work so the change cannot pass unnoticed.
 *
 * They open in a new tab, deliberately and not as a stylistic default — the
 * panel behind them is holding a chosen child, a possibly half-answered location
 * question and a ticked box or two, and navigating away would throw all of it
 * out to read a document the panel is *asking* them to read.
 *
 * **A slug belonging to no bundle is still offered, and still gates.** It has no
 * sentence of its own and nothing to link to, so it gets a row carrying the
 * generic sentence with its raw slug above it, as plain text — clicking it ticks
 * the box like any other part of the row, because there is nothing to read there
 * and so nothing being interrupted. Today that is exactly the drift case, a slug
 * the database knows and this deploy does not: registry rows arrive by migration
 * and the map ships in the same deploy, so it is a defect to notice. It looks
 * wrong, which is correct — and the alternative, dropping it, would let the
 * enrolment through without a consent the product legally requires.
 */
function RequiredConsentSection({
  productType,
  selfSeat,
  rows,
  agreements,
  onAgreementChange,
  rulesAgreed,
  onRulesAgreedChange,
}: {
  productType: ProductType;
  /**
   * True when the selected participant is the reader themselves. Chosen from
   * the *selection*, not from the product's audience: on a mixed product the
   * same panel ticks a consent about a child or about the reader depending on
   * which row is lit, and the sentence has to follow the row.
   */
  selfSeat: boolean;
  /**
   * What this product requires, grouped into the rows a parent meets. Empty on
   * nearly every product, leaving the heading and the rules row — the baseline
   * every panel shows. Nothing is reserved for rows that are not there: the
   * requirement set arrives with the product read and cannot change under a
   * reader mid-form, so there is no late arrival to hold room for.
   */
  rows: readonly RequiredConsentDisplayRow[];
  agreements: ReadonlySet<string>;
  onAgreementChange: (rowKey: string, agreed: boolean) => void;
  rulesAgreed: boolean;
  onRulesAgreedChange: (next: boolean) => void;
}) {
  const t = useTranslations("productDetail.signupPanel");
  const tRules = useTranslations("productDetail.signupPanel.rules");
  // Exactly one of the four rules third-persons a child: the municipality
  // club's, which is a consent about "my child's seat" opening for the next
  // family. The other three are about conduct and read identically whoever
  // holds the seat, so the self variant is keyed on the one rule that needs it
  // rather than duplicating three identical sentences into a parallel group
  // that would then have to be kept in step in five locales.
  //
  // Rich text, like a bundle's sentence and for the same reason: the rules
  // sentence names the policy it is a consent to, and the name is the link.
  // All five variants carry the one `<policy>` tag, so the tag map is written
  // once here rather than per variant — a locale that drops it would render its
  // own words unlinked rather than lose the clause.
  const policyTag = {
    policy: (chunks: React.ReactNode) => (
      <ConsentSentenceLink href={ROUTES.antiBullying}>
        {chunks}
      </ConsentSentenceLink>
    ),
  };
  const ruleText =
    selfSeat && productType === "municipality_club"
      ? tRules.rich("municipality_club_self", policyTag)
      : tRules.rich(productType, policyTag);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{t("consents.heading")}</h3>
      {rows.map((row) =>
        row.kind === "bundle" ? (
          <BundleConsentRow
            key={row.key}
            bundle={row.bundle}
            agreed={agreements.has(row.key)}
            onAgreedChange={(next) => onAgreementChange(row.key, next)}
          />
        ) : (
          <ConsentRow
            key={row.key}
            agreed={agreements.has(row.key)}
            onAgreedChange={(next) => onAgreementChange(row.key, next)}
            sentence={
              <>
                {/* The raw slug at the head of the sentence rather than in a
                    slot of its own: it is part of what this row is asking, and
                    a row that names a document has to name it where the reader
                    is already looking. Never an anchor with nowhere to go — an
                    empty href resolves to the page the reader is already on. */}
                <span className="mb-2 block font-medium text-foreground">
                  {row.slug}
                </span>
                {t("consents.agree")}
              </>
            }
          />
        ),
      )}
      {/* Ours, and always last: whatever else a product attaches to a seat, the
          final thing a parent agrees to before the button is the one thing
          School of Gaming asks of them. */}
      <ConsentRow
        agreed={rulesAgreed}
        onAgreedChange={onRulesAgreedChange}
        sentence={ruleText}
      />
    </div>
  );
}

/**
 * **The optional ask: a partner's mailing list, offered on the way past.**
 *
 * Everything about it is chosen to say "this is not one of those" to a reader
 * who has just met the Required consent section, because the single most
 * expensive mistake here would be a parent believing they had to tick it:
 *
 * - **It stands outside the section above**, with no heading of its own. That
 *   section is one act — everything a parent must agree to, which the CTA names
 *   as one step — and a row inside it that did not gate the button would be a
 *   box the reader cannot tell from the ones that do.
 * - **It says "Optional" in its own hint, and that sentence is the only marker
 *   in the consent area** — every gate above it is unmarked, so this is the
 *   exception rather than one label among many. The distinction has been carried
 *   three ways now and the current one is the cheapest: first by *withholding*
 *   the border the required rows wear (a plain line beside boxed gates), which
 *   died when the border became the click target rather than a weight — the
 *   lighter rows read as gates that had failed to render, and nothing reached a
 *   reader who was not looking at the screen. Then by an info-toned chip at the
 *   end of the first line, which said one word the hint underneath was already
 *   saying and spent a line of rail height doing it. Now the hint says it alone,
 *   in the colour the chip wore, and it is in the row's accessible description
 *   either way.
 * - **It says it is optional in its own words** too, under the sentence, and names
 *   where the answer can be changed later — because it *can* be, which is the
 *   deepest difference between this and everything above it. A required consent
 *   is a statement about the moment of enrolment and cannot be unmade; this is
 *   a standing permission about a mailbox, and the parent owns it afterwards.
 *
 * **The partner is a link, and it opens in a new tab** — the same treatment a
 * consent document's name gets, for the same two reasons. A parent asked to
 * hand their address to somebody has to be able to look at who that somebody
 * is, and the panel behind them is holding a half-filled form that must survive
 * the reading.
 *
 * **Nothing here touches the CTA.** No leaf in the button's checklist, no entry
 * in `formReady`: declining is a complete answer, and a button that waited on
 * one would be a requirement wearing an optional label.
 *
 * Renders nothing at all when the product asks for nothing, which is nearly
 * every product. There is no space held open for it: the ask set arrives with
 * the product read and cannot appear under a reader mid-form.
 */
function OptionalMarketingSection({
  rows,
  granted,
  onGrantedChange,
}: {
  rows: readonly MarketingConsentAskRow[];
  granted: ReadonlySet<MarketingConsentType>;
  onGrantedChange: (consentType: MarketingConsentType, next: boolean) => void;
}) {
  const t = useTranslations("productDetail.signupPanel.consents.marketing");
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      {/* The hint goes under the sentence rather than beside it: at rail width
          there is no beside, and the sentence is what the tick means while this
          is a note about the tick. In the info tone, because this sentence is
          also the row's optional marker — it opens with the word, so nothing
          else has to carry it. */}
      {rows.map(({ type, ask }) => (
        <CheckboxRow
          key={type}
          size="xs"
          checked={granted.has(type)}
          onCheckedChange={(next) => onGrantedChange(type, next)}
          label={
            <span className="text-muted-foreground">
              {t.rich(ask.sentenceKey, {
                link: (chunks) => (
                  <ConsentSentenceLink href={ask.href}>
                    {chunks}
                  </ConsentSentenceLink>
                ),
              })}
            </span>
          }
          hint={t("hint")}
          hintTone="info"
        />
      ))}
    </div>
  );
}

/**
 * **One bundle, as the sentence that consents to it.**
 *
 * The label is the bundle's own authored sentence, rendered as rich text so
 * each named tag becomes a link to the document it names — `<terms>…</terms>`
 * and `<privacy>…</privacy>` on the Roblox bundle, whose slugs the bundle's
 * `sentenceTags` map supplies. A component per bundle rather than a loop with
 * hooks in it, and it is also what keeps the tag map local to the row it
 * belongs to.
 *
 * A tag pointed at a document this deploy cannot name renders its own words as
 * plain text instead of as an anchor. It should be unreachable — a bundle only
 * ever names documents from the same map — but a link the renderer will not
 * trust must degrade to its label rather than to an anchor with nowhere to go,
 * because an empty href resolves to the page the reader is already on.
 */
function BundleConsentRow({
  bundle,
  agreed,
  onAgreedChange,
}: {
  bundle: ConsentDocumentBundle;
  agreed: boolean;
  onAgreedChange: (next: boolean) => void;
}) {
  const t = useTranslations("productDetail.signupPanel.consents.bundles");
  const tags: Record<string, (chunks: React.ReactNode) => React.ReactNode> = {};
  for (const [tag, slug] of Object.entries(bundle.sentenceTags)) {
    const meta = consentDocumentMeta(slug);
    tags[tag] = (chunks) =>
      meta === null ? (
        <span className="font-medium text-foreground">{chunks}</span>
      ) : (
        <ConsentSentenceLink href={meta.href}>{chunks}</ConsentSentenceLink>
      );
  }
  return (
    <ConsentRow
      agreed={agreed}
      onAgreedChange={onAgreedChange}
      sentence={t.rich(bundle.sentenceKey, tags)}
    />
  );
}

/**
 * A document named inside a consent sentence, as the link that opens it.
 *
 * One treatment for every such name, wherever it appears: a bundle's documents
 * and the rules row's policy are the same kind of thing to a reader, so telling
 * them apart by weight or colour would be inventing a distinction the section
 * does not have. New tab, for the reason on the section above — the panel is
 * holding a half-filled form the reader is meant to come back to.
 */
function ConsentSentenceLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline-offset-2 hover:underline"
    >
      {children}
    </a>
  );
}

/**
 * One thing to agree to: the shared `CheckboxRow`, carrying the sentence and
 * nothing else.
 *
 * Shared by every row rather than written per kind, because "the rows are
 * indistinguishable" is the point of the section — a reader must not be able to
 * tell our rules from a product's documents by their treatment, only by what
 * they say.
 *
 * **No marker, and that is what says "required".** Every row here is a gate, and
 * gates are the ordinary case in this section — the exception is the optional
 * marketing row below it, which is the only one that says anything about which
 * kind it is. Labelling both was tried and made a column of repeated words that
 * wrapped badly at rail width and told a reader nothing they could act on; one
 * marked exception among unmarked defaults says the same thing for free.
 *
 * `sentence` takes a node rather than a string because a consent sentence
 * carries its own links inline — a bundle's documents, the rules row's policy,
 * and the raw slug that heads a drift row. A caller passing links accepts that
 * a click on one reads instead of ticking, which the DOM gives for free (see
 * the section's note above).
 */
function ConsentRow({
  agreed,
  onAgreedChange,
  sentence,
}: {
  agreed: boolean;
  onAgreedChange: (next: boolean) => void;
  sentence: React.ReactNode;
}) {
  return (
    <CheckboxRow
      size="xs"
      checked={agreed}
      onCheckedChange={onAgreedChange}
      label={<span className="text-muted-foreground">{sentence}</span>}
    />
  );
}

// ---------- Helpers ----------

function useVerb(productType: ProductType): string {
  const t = useTranslations("productDetail.signupPanel.verb");
  return t(productType);
}

// Returns the active-state CTA label, optionally weaving in the price the
// parent will be charged. The two ICU strings keep the trailing arrow at
// the end of the label rather than between the verb and the price (which
// is what plain string concatenation produced previously). Inlined to
// keep the closure-bound `t` from crossing function boundaries (next-intl's
// typed message inference trips on that — see products architecture doc).
function useActiveCtaLabel(
  verb: string,
  option: PricingOption,
  currency: SupportedCurrency,
  locale: string,
): string {
  const t = useTranslations("productDetail.signupPanel");
  const price = priceForCta(option, currency, locale);
  if (price === null) return t("ctaActive", { verb });
  // Consumer clubs are a monthly subscription — the CTA carries a "/mo"
  // cadence so the button doesn't read like a one-time charge. Single-payment
  // (upfront) products keep the bare price.
  if (option.kind === "subscription") {
    return t("ctaActiveWithPriceSub", { verb, price });
  }
  return t("ctaActiveWithPrice", { verb, price });
}

function priceForCta(
  option: PricingOption,
  currency: SupportedCurrency,
  locale: string,
): string | null {
  switch (option.kind) {
    case "free":
    case "external":
    case "unavailable":
      return null;
    case "subscription":
    case "upfront":
      return formatCurrencyFromCents(option.totalCents, currency, locale);
  }
}
