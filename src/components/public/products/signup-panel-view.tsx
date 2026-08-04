"use client";

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
import { SeatAvailabilityBar } from "./seat-availability-bar";

// Top-level Signup Panel View. Pure presentational: takes resolved
// state and emits intent callbacks. Renders the right banner + body
// for the registration state, the pricing picker, and the form (or
// the auth overlay).
//
// Important detail for the pre-open → open flip: the form-shaped panels
// (closed_pre, open, full_waitlist) all reuse the same
// `<SignupForm>` instance. That keeps the parent's selected gamer +
// agreed checkbox + pricing pick stable across the countdown flip — so
// when the clock hits zero, the parent really does have a one-tap
// sign-up.

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
    case "full_waitlist":
      return <FullWaitlistPanel {...props} />;
    case "pending_thr":
      return <ThresholdPanel {...props} />;
    case "closed_pre":
      return <PreOpenPanel {...props} />;
    case "open":
      return <OpenPanel {...props} />;
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
// through a browse card — registrationCtaKind resolves them to a disabled card
// button or no button at all — so the only way in is a stale link or bookmark.
// That makes three bespoke layouts not worth maintaining, and the exact reason
// not worth spelling out: they collapse to one generic note, no actionable CTA.
// (The RegistrationState kinds stay distinct — the card layer still needs them;
// only the panel rendering merges.)
function ClosedPanel({ productType }: { productType: ProductType }) {
  const t = useTranslations("productDetail.signupPanel");
  return (
    <PanelShell productType={productType}>
      <p className="text-sm text-muted-foreground">{t("closedNote")}</p>
    </PanelShell>
  );
}

// ---------- Variant: Full + waitlist ----------

function FullWaitlistPanel(props: SignupPanelViewProps) {
  const t = useTranslations("productDetail.signupPanel");
  if (props.state.kind !== "full_waitlist") return null;
  return (
    <PanelShell productType={props.productType}>
      {/* Same seat bar as any capped product — full reads as "0 of N seats
          remaining" with the waitlist chip, so the parent sees the capacity
          story like everywhere else. The "how the waitlist works" detail moved
          to the post-join summary (it's "what happens next"). */}
      <SeatAvailabilityBar
        seatCount={props.state.seatCount}
        seatsLeft={0}
        waitlistEnabled
      />
      <PricingPanelView
        option={props.pricingOption}
        currency={props.currency}
        locale={props.locale}
      />
      <FormOrAuth
        {...props}
        // Full+waitlist branch dispatches to onJoinWaitlist instead of onSubmit.
        onSubmit={props.onJoinWaitlist}
        ctaLabelActive={t("ctaWaitlist")}
        active
        variant="secondary"
      />
    </PanelShell>
  );
}

// ---------- Variant: Threshold-pending ----------

// Threshold handling is deferred, so this state shows a plain sign-up panel —
// the same banner / pricing / form as a non-urgent open product, with no seat
// bar and no threshold meter. The product reads as if it has no seating
// constraints (cf. the pre-open panel, which also renders no bar).
function ThresholdPanel(props: SignupPanelViewProps) {
  const verb = useVerb(props.productType);
  const activeLabel = useActiveCtaLabel(
    verb,
    props.pricingOption,
    props.currency,
    props.locale,
  );

  if (props.state.kind !== "pending_thr") return null;

  return (
    <PanelShell productType={props.productType}>
      <PricingPanelView
        option={props.pricingOption}
        currency={props.currency}
        locale={props.locale}
      />
      <FormOrAuth {...props} ctaLabelActive={activeLabel} active />
    </PanelShell>
  );
}

// ---------- Variant: Pre-open ----------

function PreOpenPanel(props: SignupPanelViewProps) {
  // Hooks first so the linter can verify they always run in the same
  // order across renders. The conditional early return is unreachable
  // in practice (the parent dispatches by kind) but kept for type
  // narrowing in the JSX below.
  const opensAt =
    props.state.kind === "closed_pre"
      ? props.state.opensAt
      : "2099-01-01T00:00:00Z";
  const targetMs = new Date(opensAt).getTime();
  const isOpen = useCountdownDone(targetMs);
  const verb = useVerb(props.productType);
  const activeLabel = useActiveCtaLabel(
    verb,
    props.pricingOption,
    props.currency,
    props.locale,
  );

  if (props.state.kind !== "closed_pre") return null;

  return (
    <PanelShell productType={props.productType}>
      <PricingPanelView
        option={props.pricingOption}
        currency={props.currency}
        locale={props.locale}
      />
      <FormOrAuth
        {...props}
        // The prep checklist in SignupForm runs the same whether or not
        // registration is open yet, so a parent can finish every step during the
        // countdown. `active={isOpen}` only gates the final leaf: until the clock
        // hits zero a fully-prepped parent sees "Ready & waiting"; at zero it
        // flips in place to the live action label (same as the open panel).
        ctaLabelActive={activeLabel}
        active={isOpen}
      />
      {/* Countdown stays mounted across the pre-open → open flip. When the
          target instant arrives we set `done`, which keeps the four cells
          in place but renders them as `--` placeholders. Unmounting the
          clock would shrink the panel — and because the panel is sticky on
          desktop and reflows on mobile, that shrink propagates outward
          (page section height changes, sticky bottom anchor pulls content
          up, etc.) and the Sign-up button shifts under the parent's
          cursor. The whole point of the live countdown is the one-tap-buy
          moment, so the slot is held constant. */}
      <CountdownClock targetMs={targetMs} done={isOpen} />
    </PanelShell>
  );
}

// ---------- Variant: Open ----------

function OpenPanel(props: SignupPanelViewProps) {
  const verb = useVerb(props.productType);
  const activeLabel = useActiveCtaLabel(
    verb,
    props.pricingOption,
    props.currency,
    props.locale,
  );

  if (props.state.kind !== "open") return null;

  return (
    <PanelShell productType={props.productType}>
      {props.state.seatCount !== null && (
        // seatsLeft is live now — deriveRegistrationState computes it from the
        // real product_seat_counts row. The `?? seatCount` is only type
        // narrowing: the open state types seatsLeft as `number | null`, but
        // derive only returns null when seatCount is null (the branch we're
        // already inside excludes that), so the fallback is unreachable.
        <SeatAvailabilityBar
          seatCount={props.state.seatCount}
          seatsLeft={props.state.seatsLeft ?? props.state.seatCount}
          waitlistEnabled={props.state.waitlistEnabled}
        />
      )}
      <PricingPanelView
        option={props.pricingOption}
        currency={props.currency}
        locale={props.locale}
      />
      <FormOrAuth {...props} ctaLabelActive={activeLabel} active />
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
        {/* Keyed by type like every other action word on this panel — the sign-in
            button names the same action the signed-in CTA will, so "register" on
            an event (where the verb is "join" everywhere else) was the one place
            the panel changed vocabulary on the way through the door. */}
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
