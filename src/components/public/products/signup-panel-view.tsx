"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Identicon } from "@/components/ui/identicon";
import { cn, formatCurrencyFromCents } from "@/lib/utils";
import { MAX_GAMERS_PER_PARENT } from "@/lib/constants";
import type { ProductType } from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";
import { CountdownClock, useCountdownDone } from "./countdown-clock";
import type { RegistrationState } from "./derive-registration-state";
import { PricingPanelView } from "./pricing-panel-view";
import type { PricingOption } from "./pricing-options";
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

export type AuthState =
  | { kind: "unauthenticated"; signInHref: string; createAccountHref: string }
  | { kind: "non_customer" }
  | {
      // A signed-in customer. `gamers` may be empty — the picker always renders
      // an "Add a child" row, so the zero-gamer case needs no separate state;
      // it's just a picker with no selectable rows yet.
      kind: "ready";
      gamers: readonly {
        id: string;
        name: string;
        age: number | null;
        /**
         * When set, this child already holds a seat (`active`) or a waitlist
         * spot (`waitlisted`) on the product — the picker shows them disabled
         * and labels their state in place instead of letting the parent sign
         * them up a second time.
         */
        signupState?: MyParticipationState | null;
      }[];
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

export interface SignupPanelViewProps {
  productType: ProductType;
  state: RegistrationState;
  authState: AuthState;
  /** The single purchase option for this product (one per type). */
  pricingOption: PricingOption;
  /** Resolved by the adapter; null while the user has no gamer selected. */
  selectedGamerId: string | null;
  onSelectGamer: (gamerId: string) => void;
  /** Opens the Add Gamer dialog (owned by the adapter). */
  onAddGamer: () => void;
  agreed: boolean;
  onAgreedChange: (next: boolean) => void;
  onSubmit: () => void;
  /** Separate from onSubmit — the waitlist branch calls this. */
  onJoinWaitlist: () => void;
  /** Mutation-state hint for disabling the CTA while in flight. */
  submitting?: boolean;
  /** Server-side error from the most recent submit. */
  submitError?: string | null;
  currency: SupportedCurrency;
  locale: string;
}

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
      return <NonCustomerOverlay />;
    case "ready":
      // selectedGamerId comes through `props` (it's a top-level View prop,
      // not part of the AuthState union — see SignupPanelViewProps).
      return <SignupForm {...props} gamers={props.authState.gamers} />;
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
    <div className="flex flex-col gap-2">
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
    </div>
  );
}

function NonCustomerOverlay() {
  const t = useTranslations("productDetail.signupPanel");
  return (
    <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
      {t("nonCustomerNote")}
    </p>
  );
}

function SignupForm(
  props: FormOrAuthProps & {
    gamers: Extract<AuthState, { kind: "ready" }>["gamers"];
  },
) {
  const t = useTranslations("productDetail.signupPanel");
  // The "Add Gamer" row reuses the family namespace's label so the wording
  // stays in lockstep with the family selector / My Gamers tile.
  const tFamily = useTranslations("family");
  // Steven Brown Rule — hide the add affordance at the cap, same as the family
  // selector / My Gamers grid. `gamers` is the parent's full roster (enrolled
  // ones included), so its length is the right count to test.
  const canAddGamer = props.gamers.length < MAX_GAMERS_PER_PARENT;
  const formReady = props.selectedGamerId !== null && props.agreed;
  const clickable = formReady && props.active && !props.submitting;

  // The CTA doubles as the instruction for the parent's next step: while it's
  // disabled it names exactly what's still missing, in the order they can act
  // on it (add a gamer → agree to the rules → wait for the window). The same
  // checklist runs whether or not registration is open, so a parent can finish
  // every step during the pre-open countdown and land on "Ready & waiting",
  // primed to one-tap the instant it opens. Only the final leaf differs by
  // window: the live action label once open (`active`), the holding state until
  // then. selectedGamerId is null only when no child is selectable: either
  // there's still room to add one (canAddGamer → prompt to add a gamer), or
  // every child is already on the product at the gamer cap (nothing left to do
  // — the picker rows show each child's exact seat/waitlist status in place).
  const ctaLabel = props.submitting
    ? t("ctaSubmitting")
    : props.selectedGamerId === null
      ? canAddGamer
        ? t("ctaAddGamer")
        : t("ctaAllSet")
      : !props.agreed
        ? t("ctaAgreeRules")
        : props.active
          ? props.ctaLabelActive
          : t("ctaReadyWaiting");

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/30 p-4">
        <h3 id="gamer-picker-label" className="text-sm font-semibold">
          {/* Per-type heading — matches the product's action verb
              (enrol / register / sign up / join). */}
          {t(`whoAreYouSigningUp.${props.productType}`)}
        </h3>
        <div className="mt-3 space-y-2">
          <div
            role="radiogroup"
            aria-labelledby="gamer-picker-label"
            className="space-y-2"
          >
            {props.gamers.map((g) => {
              // A child already holding a seat / waitlist spot can't be signed up
              // again — the row is disabled and labels its state in place rather
              // than offering itself for selection.
              const alreadyOn = g.signupState ?? null;
              const selected = props.selectedGamerId === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={alreadyOn !== null}
                  onClick={() => props.onSelectGamer(g.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                    alreadyOn !== null
                      ? "cursor-not-allowed border-input bg-muted/40 opacity-60"
                      : selected
                        ? "border-primary bg-primary/10"
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
                      {g.age !== null && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t("agePill", { age: g.age })}
                        </span>
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
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-input px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              {tFamily("addGamer")}
            </button>
          )}
        </div>
      </div>

      <RulesCheckbox
        productType={props.productType}
        agreed={props.agreed}
        onAgreedChange={props.onAgreedChange}
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

function RulesCheckbox({
  productType,
  agreed,
  onAgreedChange,
}: {
  productType: ProductType;
  agreed: boolean;
  onAgreedChange: (next: boolean) => void;
}) {
  const t = useTranslations("productDetail.signupPanel.rules");
  // Heading names this section "The Rules" so the CTA's "Agree to the rules"
  // prompt has a visible referent — the rule sentence itself never says the
  // word. The whole box is one clickable toggle (heading + rule + checkbox)
  // that highlights when agreed. No nested box: unlike the gamer picker — whose
  // outer box wraps a border-per-selectable-row — the rules section is a single
  // choice, so a box-in-a-box would just be visual noise.
  const tPanel = useTranslations("productDetail.signupPanel");
  return (
    <label
      className={cn(
        "block cursor-pointer rounded-md border p-4 transition-colors",
        agreed
          ? "border-primary bg-primary/5"
          : "border-border bg-muted/30 hover:bg-accent/50"
      )}
    >
      <h3 className="text-sm font-semibold">{tPanel("rulesHeading")}</h3>
      <div className="mt-3 flex items-start gap-3 text-xs">
        <Checkbox
          className="mt-0.5"
          checked={agreed}
          onChange={(e) => onAgreedChange(e.target.checked)}
        />
        <span className="text-muted-foreground">{t(productType)}</span>
      </div>
    </label>
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
