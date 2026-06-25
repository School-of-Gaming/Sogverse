"use client";

import { useTranslations } from "next-intl";
import type { RegistrationState } from "./derive-registration-state";

// CTA derivation for the browse-card layer. Returns `null` when the card
// should hide its CTA entirely (running_late, ended). Returns
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
      // identical row-to-row; the seat-availability bar and footer carry
      // the state signal, not the button color.
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
