"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  AlertCircle,
  CalendarClock,
  Clock,
  Hourglass,
  Lock,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { RegistrationState } from "./derive-registration-state";
import { StatusChip, type ChipTone } from "./status-chip";

// Presentational pill that surfaces a product's registration state
// inline next to the topic label. Speaks parent voice ("Only 2 spots
// left", "Need 3 more to start") and only renders when there's
// something *actionable or urgency-creating* to say — the default
// "this is a club, you can sign up" leaves the row blank and lets the
// CTA do the talking.
//
// Visual treatment is the shared outline `StatusChip` — a small rounded chip
// with a tinted icon + label. Quiet enough to sit next to a busy thumbnail but
// legible at a glance.

interface RegistrationPillProps {
  state: RegistrationState;
  className?: string;
}

// Threshold at or below which an `open` product earns the
// "Only N spots left" urgency pill. Anything above stays pill-less.
const URGENCY_SEATS_LEFT = 3;

// `null` here means "no pill — the row's empty space is the message."
// The card layer handles that case by not reserving a slot.
type Decoration = { tone: ChipTone; label: string };

export function RegistrationPill({ state, className }: RegistrationPillProps) {
  const t = useTranslations("productBrowse.card");
  const format = useFormatter();
  const decoration = decorationFor(state, t, format);

  if (!decoration) return null;

  return (
    <StatusChip
      tone={decoration.tone}
      icon={iconForState(state)}
      className={className}
    >
      {decoration.label}
    </StatusChip>
  );
}

function iconForState(state: RegistrationState): LucideIcon {
  switch (state.kind) {
    case "open":
      return AlertCircle;
    case "pending_thr":
    case "full_waitlist":
      return Hourglass;
    case "full_closed":
      return XCircle;
    case "closed_pre":
      return CalendarClock;
    case "running_late":
      return Lock;
    case "ended":
      return Clock;
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
// but isn't usable (full_closed). Otherwise returns a primary "View" CTA
// regardless of which actionable state we're in.
//
// `kind` lets the card pick a button variant; `labelText` is pre-resolved
// so the card doesn't need to know the i18n keys.
export interface RegistrationCta {
  kind: "primary" | "disabled";
  labelText: string;
}

export function useRegistrationCta(
  state: RegistrationState,
): RegistrationCta | null {
  const t = useTranslations("productBrowse.card");

  switch (state.kind) {
    case "open":
    case "pending_thr":
    case "closed_pre":
    case "full_waitlist":
      // Every state with *something* to do on the detail page (sign up,
      // prep for the open moment, watch the threshold, join the waitlist)
      // shares the same primary "View" CTA. Card buttons stay visually
      // identical row-to-row; the registration pill carries the state
      // signal, not the button color.
      return { kind: "primary", labelText: t("viewDetails") };
    case "full_closed":
      // Hard dead end — full and no waitlist. The detail page has
      // nothing actionable, so the button stays disabled and the parent
      // isn't sent on a round-trip.
      return { kind: "disabled", labelText: t("fullDisabled") };
    case "running_late":
    case "ended":
      return null;
  }
}
