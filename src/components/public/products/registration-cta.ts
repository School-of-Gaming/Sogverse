"use client";

import { useTranslations } from "next-intl";
import {
  registrationCtaKind,
  type RegistrationState,
} from "./derive-registration-state";

// CTA derivation for the browse-card layer. Returns `null` when the card
// should hide its CTA entirely (ended). Returns `{ kind: "disabled" }` for
// states where the action exists conceptually but isn't usable (full_closed,
// running_late). Otherwise returns a primary "View" CTA regardless of which
// actionable state we're in.
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

  // The state→behaviour decision lives in `registrationCtaKind`; this hook
  // only resolves the matching label. Every primary state shares the same
  // "View" CTA so card buttons stay visually identical row-to-row — the
  // seat-availability bar and footer carry the state signal, not the button.
  const kind = registrationCtaKind(state);
  if (kind === null) return null;
  if (kind === "disabled") {
    // Two states share the disabled outline button; the label says which —
    // "Full" (no seats) vs. "Already started" (camp/event underway).
    const labelText =
      state.kind === "running_late" ? t("alreadyStarted") : t("fullDisabled");
    return { kind, labelText };
  }
  return { kind, labelText: t("viewDetails") };
}
