"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  AlertCircle,
  CalendarClock,
  Clock,
  Hourglass,
  Lock,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RegistrationState } from "./derive-registration-state";

// Presentational pill that surfaces a product's registration state
// inline next to the topic label. The pill is parent-voice and only
// renders when there's something *actionable or urgency-creating* to
// say — the default "this is a club, you can sign up" leaves the row
// blank and lets the CTA do the talking.
//
// Three visual variants are exposed so design review can pick the
// treatment that scans best:
//   `dot`     — coloured dot + label. Reads as a status indicator.
//   `filled`  — solid pill in the state's tone. Loudest variant; best
//               for grids where availability is the deciding factor.
//   `outline` — border + tinted text + icon. Quieter but still legible
//               against a busy thumbnail.
//
// Only an "almost full" open product earns a pill; anything more
// open than that returns null and lets the row breathe.

export type RegistrationPillVariant = "dot" | "filled" | "outline";

export const PILL_VARIANTS: readonly RegistrationPillVariant[] = [
  "dot",
  "filled",
  "outline",
] as const;

// Threshold at or below which an `open` product earns the
// "Only N spots left" urgency pill. Anything above stays pill-less.
const URGENCY_SEATS_LEFT = 3;

interface RegistrationPillProps {
  state: RegistrationState;
  variant?: RegistrationPillVariant;
  className?: string;
}

// Semantic tone per state. Keeps the colour decision in one place
// independent of the chosen visual treatment.
type Tone = "warning" | "info" | "muted";

const TONE_DOT: Record<Tone, string> = {
  warning: "bg-warning",
  info: "bg-info",
  muted: "bg-muted-foreground",
};

const TONE_FILLED: Record<Tone, string> = {
  warning: "bg-warning text-warning-foreground",
  info: "bg-info text-info-foreground",
  muted: "bg-muted text-muted-foreground",
};

const TONE_OUTLINE: Record<Tone, string> = {
  warning: "border-warning/50 text-warning",
  info: "border-info/40 text-info",
  muted: "border-border text-muted-foreground",
};

// `null` here means "no pill — the row's empty space is the message."
// The card layer handles that case by not reserving a slot.
type Decoration = { tone: Tone; label: string };

export function RegistrationPill({
  state,
  variant = "outline",
  className,
}: RegistrationPillProps) {
  const t = useTranslations("productBrowse.card");
  const format = useFormatter();
  const decoration = decorationFor(state, t, format);

  if (!decoration) return null;

  const { tone, label } = decoration;

  switch (variant) {
    case "dot":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium text-foreground",
            className,
          )}
        >
          <span
            aria-hidden
            className={cn("h-2 w-2 rounded-full", TONE_DOT[tone])}
          />
          {label}
        </span>
      );

    case "filled":
      return (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            TONE_FILLED[tone],
            className,
          )}
        >
          {label}
        </span>
      );

    case "outline":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium",
            TONE_OUTLINE[tone],
            className,
          )}
        >
          <StateIcon state={state} className="h-3 w-3" />
          {label}
        </span>
      );
  }
}

// Returning a component (not aliasing one to a local variable) keeps
// `react-hooks/static-components` happy. Wrapping in a tiny component
// also lets the className flow through as a JSX attribute, which the
// i18n literal-string rule allows-lists.
function StateIcon({
  state,
  className,
}: {
  state: RegistrationState;
  className?: string;
}) {
  switch (state.kind) {
    case "open":
      return <AlertCircle className={className} aria-hidden />;
    case "pending_thr":
    case "full_waitlist":
      return <Hourglass className={className} aria-hidden />;
    case "full_closed":
      return <XCircle className={className} aria-hidden />;
    case "closed_pre":
      return <CalendarClock className={className} aria-hidden />;
    case "running_late":
      return <Lock className={className} aria-hidden />;
    case "ended":
      return <Clock className={className} aria-hidden />;
  }
}

// Closure-bound helper — `t` (typed-message-inference) and `format`
// shouldn't cross function boundaries (TS2589). See note in
// product-browse-card.tsx.
function decorationFor(
  state: RegistrationState,
  t: ReturnType<typeof useTranslations<"productBrowse.card">>,
  format: ReturnType<typeof useFormatter>,
): Decoration | null {
  switch (state.kind) {
    case "open":
      // Only urgent-low seats earn a pill. Plenty-of-seats and
      // no-cap return null — the Sign-up button alone says everything
      // a parent needs.
      if (state.seatsLeft === null || state.seatsLeft > URGENCY_SEATS_LEFT) {
        return null;
      }
      return {
        tone: "warning",
        label: t("pillSpotsLeft", { count: state.seatsLeft }),
      };
    case "pending_thr": {
      const remaining = Math.max(0, state.threshold - state.count);
      return {
        tone: "warning",
        label: t("pillNeedsMore", { count: remaining }),
      };
    }
    case "full_waitlist":
      return { tone: "warning", label: t("pillFullWaitlist") };
    case "full_closed":
      return { tone: "muted", label: t("pillFull") };
    case "closed_pre":
      return {
        tone: "info",
        label: t("pillOpensOn", {
          date: format.dateTime(new Date(state.opensAt), { dateStyle: "medium" }),
        }),
      };
    case "running_late":
      return { tone: "muted", label: t("pillStarted") };
    case "ended":
      return { tone: "muted", label: t("endedBadge") };
  }
}

// CTA derivation for the card layer. Returns `null` when the card should
// hide its CTA entirely (running_late, ended). Returns
// `{ kind: "disabled" }` for states where the action exists conceptually
// but isn't usable (full_closed, closed_pre).
//
// `kind` lets the card pick a button variant; `labelText` is pre-resolved
// so the card doesn't need to know the i18n keys.
export interface RegistrationCta {
  kind: "primary" | "secondary" | "disabled";
  labelText: string;
}

export function useRegistrationCta(
  state: RegistrationState,
): RegistrationCta | null {
  const t = useTranslations("productBrowse.card");
  const format = useFormatter();

  switch (state.kind) {
    case "open":
    case "pending_thr":
      return { kind: "primary", labelText: t("viewDetails") };
    case "full_waitlist":
      return { kind: "secondary", labelText: t("joinWaitlist") };
    case "full_closed":
      return { kind: "disabled", labelText: t("fullDisabled") };
    case "closed_pre":
      return {
        kind: "disabled",
        labelText: t("opensOnDate", {
          date: format.dateTime(new Date(state.opensAt), { dateStyle: "medium" }),
        }),
      };
    case "running_late":
    case "ended":
      return null;
  }
}
