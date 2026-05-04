"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrencyFromCents } from "@/lib/utils";
import type { ProductTypeV2 } from "@/types";
import type { SupportedCurrency } from "@/lib/constants/currency";
import { CountdownClock, useCountdownDone } from "./countdown-clock";
import type { RegistrationState } from "./derive-registration-state";
import {
  PricingPanelView,
} from "./pricing-panel-view";
import {
  findOption,
  type PricingOption,
  type PricingTracks,
} from "./pricing-options";

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
  | { kind: "no_gamers"; addGamerHref: string }
  | {
      kind: "ready";
      gamers: readonly { id: string; name: string; age: number | null }[];
    };

export interface SignupPanelViewProps {
  productType: ProductTypeV2;
  state: RegistrationState;
  authState: AuthState;
  pricingTracks: PricingTracks;
  selectedPricingKey: PricingOption["key"];
  onSelectPricing: (key: PricingOption["key"]) => void;
  /** Resolved by the adapter; null while the user has no gamer selected. */
  selectedGamerId: string | null;
  onSelectGamer: (gamerId: string) => void;
  agreed: boolean;
  onAgreedChange: (next: boolean) => void;
  onSubmit: () => void;
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

function EndedPanel({ productType }: { productType: ProductTypeV2 }) {
  const t = useTranslations("productDetail.signupPanel");
  void productType;
  return (
    <PanelShell banner={t("bannerEnded")} tone="muted">
      <p className="text-sm text-muted-foreground">{t("endedNote")}</p>
    </PanelShell>
  );
}

// ---------- Variant: Running late ----------

function RunningLatePanel({ productType }: { productType: ProductTypeV2 }) {
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
        tracks={props.pricingTracks}
        selectedKey={props.selectedPricingKey}
        onSelect={props.onSelectPricing}
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
        tracks={props.pricingTracks}
        selectedKey={props.selectedPricingKey}
        onSelect={props.onSelectPricing}
        currency={props.currency}
        locale={props.locale}
      />
      <FormOrAuth
        {...props}
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
        tracks={props.pricingTracks}
        selectedKey={props.selectedPricingKey}
        onSelect={props.onSelectPricing}
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
  const opensAt =
    props.state.kind === "closed_pre"
      ? props.state.opensAt
      : "2099-01-01T00:00:00Z";
  const targetMs = new Date(opensAt).getTime();
  const isOpen = useCountdownDone(targetMs, props.fixedNowMs);
  const verb = useVerb(props.productType);
  const activeLabel = useActiveCtaLabel(
    verb,
    props.pricingTracks,
    props.selectedPricingKey,
    props.currency,
    props.locale,
  );

  if (props.state.kind !== "closed_pre") return null;

  const banner = isOpen ? t("bannerCountdownDone") : t("bannerCountdown");
  const tone: Tone = isOpen ? "primary" : "muted";

  return (
    <PanelShell banner={banner} tone={tone}>
      {!isOpen && (
        <CountdownClock targetMs={targetMs} fixedNowMs={props.fixedNowMs} />
      )}
      <PricingPanelView
        tracks={props.pricingTracks}
        selectedKey={props.selectedPricingKey}
        onSelect={props.onSelectPricing}
        currency={props.currency}
        locale={props.locale}
      />
      <FormOrAuth
        {...props}
        helperText={t("preOpenHelper")}
        ctaLabelIdle={t("ctaPreOpenIdle", { verb })}
        ctaLabelActive={isOpen ? activeLabel : t("ctaPreOpenReady")}
        active={isOpen}
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
    props.pricingTracks,
    props.selectedPricingKey,
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
      banner={urgent ? t("bannerAlmostFull") : t("bannerOpen", { verb })}
      tone={urgent ? "warning" : "primary"}
    >
      {props.state.seatCount !== null && (
        // TODO(participations_v2): drop the `?? seatCount` fallback once
        // real seatsLeft counts are threaded through. Today seatsLeft is
        // always null (no participations table yet), so the bar fills 100%.
        // Once enrollments start landing, this fallback will lie about
        // remaining capacity until participations_v2 ships.
        <SeatCounter
          seatCount={props.state.seatCount}
          seatsLeft={props.state.seatsLeft ?? props.state.seatCount}
        />
      )}
      <PricingPanelView
        tracks={props.pricingTracks}
        selectedKey={props.selectedPricingKey}
        onSelect={props.onSelectPricing}
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
    case "no_gamers":
      return <NoGamersOverlay addGamerHref={props.authState.addGamerHref} />;
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
      <Link href={signInHref} className="w-full">
        <Button size="lg" className="w-full text-base">
          {t("ctaSignIn")}
        </Button>
      </Link>
      <Link href={createAccountHref} className="w-full">
        <Button size="lg" variant="outline" className="w-full text-base">
          {t("ctaCreateAccount")}
        </Button>
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

function NoGamersOverlay({ addGamerHref }: { addGamerHref: string }) {
  const t = useTranslations("productDetail.signupPanel");
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-muted/30 p-4">
        <p className="text-sm font-semibold">{t("noGamersTitle")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("noGamersDescription")}
        </p>
      </div>
      <Link href={addGamerHref} className="w-full">
        <Button size="lg" className="w-full text-base">
          {t("ctaAddGamer")}
        </Button>
      </Link>
    </div>
  );
}

function SignupForm(
  props: FormOrAuthProps & {
    gamers: readonly { id: string; name: string; age: number | null }[];
  },
) {
  const t = useTranslations("productDetail.signupPanel");
  const formReady = props.selectedGamerId !== null && props.agreed;
  const clickable = formReady && props.active;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-muted/30 p-4">
        <h3 className="text-sm font-semibold">{t("whoAreYouSigningUp")}</h3>
        {props.helperText && (
          <p className="mt-1 text-xs text-muted-foreground">{props.helperText}</p>
        )}
        <div className="mt-3 space-y-2">
          {props.gamers.map((g) => {
            const selected = props.selectedGamerId === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => props.onSelectGamer(g.id)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors",
                  selected
                    ? "border-primary bg-primary/10"
                    : "border-input hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <span>
                  <span className="font-medium">{g.name}</span>
                  {g.age !== null && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t("agePill", { age: g.age })}
                    </span>
                  )}
                </span>
                {selected && (
                  <span className="text-xs font-semibold text-primary">
                    {t("selected")}
                  </span>
                )}
              </button>
            );
          })}
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
        {formReady ? props.ctaLabelActive : props.ctaLabelIdle}
      </Button>
    </div>
  );
}

function RulesCheckbox({
  productType,
  agreed,
  onAgreedChange,
}: {
  productType: ProductTypeV2;
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

function useVerb(productType: ProductTypeV2): string {
  const t = useTranslations("productDetail.signupPanel.verb");
  return t(productType);
}

// Returns the active-state CTA label, optionally weaving in the price the
// parent will be charged. The two ICU strings keep the trailing arrow at
// the end of the label rather than between the verb and the price (which
// is what plain string concatenation produced previously). Inlined to
// keep the closure-bound `t` from crossing function boundaries (next-intl's
// typed message inference trips on that — see products-v2 architecture doc).
function useActiveCtaLabel(
  verb: string,
  pricingTracks: PricingTracks,
  selectedKey: PricingOption["key"],
  currency: SupportedCurrency,
  locale: string,
): string {
  const t = useTranslations("productDetail.signupPanel");
  const option = findOption(pricingTracks, selectedKey);
  const price = priceForCta(option, currency, locale);
  if (price === null) return t("ctaActive", { verb });
  return t("ctaActiveWithPrice", { verb, price });
}

function priceForCta(
  option: PricingOption | null,
  currency: SupportedCurrency,
  locale: string,
): string | null {
  if (!option) return null;
  switch (option.kind) {
    case "free":
    case "external":
    case "unavailable":
      return null;
    case "subscription":
    case "bundle":
    case "upfront":
      return formatCurrencyFromCents(option.totalCents, currency, locale);
  }
}
