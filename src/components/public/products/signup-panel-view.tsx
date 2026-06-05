"use client";

import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { cn, formatCurrencyFromCents } from "@/lib/utils";
import { MAX_GAMERS_PER_PARENT } from "@/lib/constants";
import type { ProductType } from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";
import { CountdownClock, useCountdownDone } from "./countdown-clock";
import type { RegistrationState } from "./derive-registration-state";
import { PricingPanelView } from "./pricing-panel-view";
import type { PricingOption } from "./pricing-options";

// Top-level Signup Panel View. Pure presentational: takes resolved
// state and emits intent callbacks. Renders the right banner + body
// for the registration state, the pricing picker, and the form (or
// the auth overlay).
//
// Important detail for the pre-open → open flip: the form-shaped panels
// (closed_pre, open, pending_thr, full_waitlist) all reuse the same
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
 * `reserving` is intentionally not part of this union — the movie-ticket
 * reservation model treats a held seat as the parent's to retry against
 * (they just click Sign Up again), not as an "already signed up" state.
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
  /** Render frozen at this instant for deterministic mock previews. */
  fixedNowMs?: number;
}

export function SignupPanelView(props: SignupPanelViewProps) {
  switch (props.state.kind) {
    case "ended":
      return <EndedPanel productType={props.productType} />;
    case "running_late":
      return <RunningLatePanel productType={props.productType} />;
    case "full_closed":
      return <FullClosedPanel {...props} />;
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

type Tone = "primary" | "warning" | "destructive" | "muted" | "secondary";

const TONE_BANNER: Record<Tone, string> = {
  primary: "bg-primary text-primary-foreground",
  warning: "bg-warning text-warning-foreground",
  destructive: "bg-destructive text-destructive-foreground",
  muted: "bg-muted text-muted-foreground",
  secondary: "bg-secondary text-secondary-foreground",
};

const TONE_BORDER: Record<Tone, string> = {
  primary: "border-primary/40",
  warning: "border-warning/60",
  destructive: "border-destructive/60",
  muted: "border-border",
  secondary: "border-secondary/40",
};

function PanelShell({
  banner,
  tone,
  children,
}: {
  banner: string;
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("overflow-hidden", TONE_BORDER[tone])}>
      <div
        className={cn(
          "px-5 py-2.5 text-center text-sm font-semibold",
          TONE_BANNER[tone],
        )}
      >
        {banner}
      </div>
      <CardContent className="space-y-5 p-5 sm:p-6">{children}</CardContent>
    </Card>
  );
}

// ---------- Variant: Ended ----------

function EndedPanel({ productType }: { productType: ProductType }) {
  const t = useTranslations("productDetail.signupPanel");
  void productType;
  return (
    <PanelShell banner={t("bannerEnded")} tone="muted">
      <p className="text-sm text-muted-foreground">{t("endedNote")}</p>
    </PanelShell>
  );
}

// ---------- Variant: Running late ----------

function RunningLatePanel({ productType }: { productType: ProductType }) {
  const t = useTranslations("productDetail.signupPanel");
  void productType;
  return (
    <PanelShell banner={t("bannerRunningLate")} tone="muted">
      <p className="text-sm text-muted-foreground">{t("runningLateNote")}</p>
    </PanelShell>
  );
}

// ---------- Variant: Full + closed (no waitlist) ----------

function FullClosedPanel(props: SignupPanelViewProps) {
  const t = useTranslations("productDetail.signupPanel");
  return (
    <PanelShell banner={t("bannerFullClosed")} tone="destructive">
      <PricingPanelView
        option={props.pricingOption}
        currency={props.currency}
        locale={props.locale}
      />
      <Button size="lg" className="w-full text-base" disabled>
        {t("bannerFullClosed")}
      </Button>
    </PanelShell>
  );
}

// ---------- Variant: Full + waitlist ----------

function FullWaitlistPanel(props: SignupPanelViewProps) {
  const t = useTranslations("productDetail.signupPanel");
  return (
    <PanelShell banner={t("bannerWaitlist")} tone="destructive">
      <WaitlistInfo />
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
        ctaLabelIdle={t("ctaWaitlist")}
        active
        variant="secondary"
      />
    </PanelShell>
  );
}

function WaitlistInfo() {
  const t = useTranslations("productDetail.signupPanel");
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
      <p className="font-semibold text-foreground">{t("waitlistHowTitle")}</p>
      <ul className="list-disc space-y-1 pl-4">
        <li>{t("waitlistHowItem1")}</li>
        <li>{t("waitlistHowItem2")}</li>
        <li>{t("waitlistHowItem3")}</li>
      </ul>
    </div>
  );
}

// ---------- Variant: Threshold-pending ----------

function ThresholdPanel(props: SignupPanelViewProps) {
  const t = useTranslations("productDetail.signupPanel");
  if (props.state.kind !== "pending_thr") return null;
  const { threshold, count } = props.state;
  const pct = Math.min(100, (count / threshold) * 100);
  const remaining = Math.max(0, threshold - count);

  return (
    <PanelShell banner={t("bannerThreshold")} tone="secondary">
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold tabular-nums">
            {t("thresholdProgress", { current: count, threshold })}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("thresholdRemaining", { count: remaining })}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-secondary transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("thresholdHelper", { count: threshold })}
      </p>
      <PricingPanelView
        option={props.pricingOption}
        currency={props.currency}
        locale={props.locale}
      />
      <FormOrAuth
        {...props}
        ctaLabelActive={t("ctaThreshold")}
        ctaLabelIdle={t("ctaThreshold")}
        active
      />
    </PanelShell>
  );
}

// ---------- Variant: Pre-open ----------

function PreOpenPanel(props: SignupPanelViewProps) {
  // Hooks first so the linter can verify they always run in the same
  // order across renders. The conditional early return is unreachable
  // in practice (the parent dispatches by kind) but kept for type
  // narrowing in the JSX below.
  const t = useTranslations("productDetail.signupPanel");
  const format = useFormatter();
  const opensAt =
    props.state.kind === "closed_pre"
      ? props.state.opensAt
      : "2099-01-01T00:00:00Z";
  const targetMs = new Date(opensAt).getTime();
  const isOpen = useCountdownDone(targetMs, props.fixedNowMs);
  const verb = useVerb(props.productType);
  const activeLabel = useActiveCtaLabel(
    verb,
    props.pricingOption,
    props.currency,
    props.locale,
  );

  if (props.state.kind !== "closed_pre") return null;

  // Pre-zero banner names the exact moment registration opens — the
  // countdown clock sits below the button (so the button doesn't shift
  // when it unmounts), so the banner has to carry the "when" itself.
  const banner = isOpen
    ? t("bannerCountdownDone")
    : t("bannerCountdown", {
        date: format.dateTime(new Date(targetMs), {
          dateStyle: "medium",
          timeStyle: "short",
        }),
      });
  const tone: Tone = isOpen ? "primary" : "muted";

  return (
    <PanelShell banner={banner} tone={tone}>
      <PricingPanelView
        option={props.pricingOption}
        currency={props.currency}
        locale={props.locale}
      />
      <FormOrAuth
        {...props}
        helperText={t("preOpenHelper")}
        // Idle copy flips with the countdown: pre-zero we tell the parent
        // registration isn't open yet; post-zero it reads as the live action
        // label (same as the open panel) so it never contradicts the banner.
        // The "no gamer selected" case is handled centrally in SignupForm
        // (ctaSelectGamer), so it doesn't need a special idle label here.
        ctaLabelIdle={isOpen ? activeLabel : t("ctaPreOpenIdle", { verb })}
        ctaLabelActive={isOpen ? activeLabel : t("ctaPreOpenReady")}
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
      <CountdownClock
        targetMs={targetMs}
        fixedNowMs={props.fixedNowMs}
        done={isOpen}
      />
    </PanelShell>
  );
}

// ---------- Variant: Open ----------

function OpenPanel(props: SignupPanelViewProps) {
  const t = useTranslations("productDetail.signupPanel");
  const verb = useVerb(props.productType);
  const activeLabel = useActiveCtaLabel(
    verb,
    props.pricingOption,
    props.currency,
    props.locale,
  );

  if (props.state.kind !== "open") return null;
  const urgent =
    props.state.seatsLeft !== null &&
    props.state.seatsLeft <= 3 &&
    props.state.seatsLeft > 0;

  return (
    <PanelShell
      // Non-urgent open state: the banner is a neutral section label naming the
      // *noun* of the action (Enrolment / Registration / …), deliberately NOT a
      // second "{verb} now" CTA. The solid-primary Enrol button below is the one
      // call to action; a loud primary banner here would compete with it. The
      // urgent (almost-full) banner stays loud — that's a real scarcity signal,
      // not a duplicated CTA.
      banner={urgent ? t("bannerAlmostFull") : t(`noun.${props.productType}`)}
      tone={urgent ? "warning" : "muted"}
    >
      {props.state.seatCount !== null && (
        // TODO(participations): drop the `?? seatCount` fallback once
        // real seatsLeft counts are threaded through. Today seatsLeft is
        // always null (no participations table yet), so the bar fills 100%.
        // Once enrollments start landing, this fallback will lie about
        // remaining capacity until participations ships.
        <SeatCounter
          seatCount={props.state.seatCount}
          seatsLeft={props.state.seatsLeft ?? props.state.seatCount}
        />
      )}
      <PricingPanelView
        option={props.pricingOption}
        currency={props.currency}
        locale={props.locale}
      />
      <FormOrAuth
        {...props}
        ctaLabelActive={activeLabel}
        ctaLabelIdle={activeLabel}
        active
      />
    </PanelShell>
  );
}

function SeatCounter({
  seatCount,
  seatsLeft,
}: {
  seatCount: number;
  seatsLeft: number;
}) {
  const t = useTranslations("productDetail.signupPanel");
  const pct = Math.max(0, Math.min(100, (seatsLeft / seatCount) * 100));
  const barColor =
    seatsLeft === 0
      ? "bg-destructive"
      : seatsLeft <= Math.ceil(seatCount * 0.2)
        ? "bg-warning"
        : "bg-success";

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold tabular-nums">{seatsLeft}</span>
        <span className="text-xs text-muted-foreground">
          {t("seatsRemaining", { count: seatsLeft, total: seatCount })}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-[width] duration-500", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------- Form / Auth overlay ----------

interface FormOrAuthProps extends SignupPanelViewProps {
  helperText?: string;
  ctaLabelActive: string;
  ctaLabelIdle: string;
  active: boolean;
  variant?: "default" | "secondary";
}

function FormOrAuth(props: FormOrAuthProps) {
  switch (props.authState.kind) {
    case "unauthenticated":
      return (
        <UnauthenticatedOverlay
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
  signInHref,
  createAccountHref,
}: {
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
        {t("ctaSignIn")}
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

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/30 p-4">
        <h3 id="gamer-picker-label" className="text-sm font-semibold">
          {/* Per-type heading — matches the product's action verb
              (enrol / register / sign up / join). */}
          {t(`whoAreYouSigningUp.${props.productType}`)}
        </h3>
        {props.helperText && (
          <p className="mt-1 text-xs text-muted-foreground">
            {props.helperText}
          </p>
        )}
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
        {props.submitting
          ? t("ctaSubmitting")
          : // When registration is actionable but no gamer is selected (zero
            // gamers, or all already enrolled), prompt to pick one rather than
            // showing the action verb on a dead button.
            props.active && props.selectedGamerId === null
            ? t("ctaSelectGamer")
            : formReady
              ? props.ctaLabelActive
              : props.ctaLabelIdle}
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
  return (
    <label className="flex items-start gap-2 text-xs">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={agreed}
        onChange={(e) => onAgreedChange(e.target.checked)}
      />
      <span className="text-muted-foreground">{t(productType)}</span>
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
