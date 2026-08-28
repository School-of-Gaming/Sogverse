"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductBrowseRow } from "@/types";
import type { LocationPick } from "@/components/locations/location-picker-panel";
import { localizedLocationName } from "@/lib/locations/localized-name";
import type { RegionGate } from "./region-lock/region-gate";
import { SetLocationDialog } from "./region-lock/set-location-dialog";
import {
  SignupPanelView,
  type AuthState,
  type ConfirmedHomeLocation,
} from "./signup-panel-view";
import { useSignupPanelFields } from "./use-signup-panel-fields";
import type { RegistrationState } from "./derive-registration-state";

// Preview-only signup panel. Renders the exact same `SignupPanelView` as
// production, built from the exact same `useSignupPanelFields` hook — so the
// demo cannot drift from the real panel: anything visual lives in the view,
// anything feeding it lives in the hook.
//
// The only real difference is the side effect of the action callbacks (a fixture
// demo can't touch the API): the CTA navigates to the summary preview instead of
// firing a mutation, and "Add a child" is inert.
//
// We deliberately keep the action *async with a spinner*, even though the demo
// has nothing to wait for. In production that spinner covers the mutation that
// writes the participation row, and the await is load-bearing for correctness,
// not just UX: the summary reads the row by id, so navigating before the write
// commits would race it (a blank / "not found" summary). Faking the wait keeps
// the demo honest about the brief "Signing up…" state a real parent sees before
// the page turns.
interface PreviewSignupPanelProps {
  product: Pick<
    ProductBrowseRow,
    | "product_type"
    | "billing_mode"
    | "product_prices"
    | "for_gamers"
    | "start_date"
    | "timezone"
  >;
  /**
   * The consent documents this scenario's product requires, as slugs — the
   * scene's half of what the live route reads off the product embed. Defaulted
   * to none so every ordinary scenario stays exactly as it was.
   */
  requiredConsentSlugs?: readonly string[];
  // TEMP — strip before merge. Obviously-fake extra consent rows for the
  // `required-consents-tall` scenario, handed straight to the view so the panel
  // outgrows the window. Nothing outside that scenario sets it.
  fillerConsents?: readonly string[];
  state: RegistrationState;
  authState: AuthState;
  /** Where the CTA lands — the matching `/preview/confirmation/<scenario>`. */
  summaryHref: string;
  /**
   * The region lock's answer for this viewer, derived by the scene exactly as
   * the live route's data shell derives it. Absent on every ordinary product
   * scenario.
   */
  regionGate?: RegionGate;
  /** The family's location, as the gate's `eligible` variant says it back. */
  homeLocationName?: string | null;
  /** A place confirmed in the location dialog. */
  onLocationPicked?: (confirmed: ConfirmedHomeLocation) => void;
}

// Long enough that the "Signing up…" state is visibly the same beat a real
// commit takes, short enough not to annoy someone clicking through demos.
const FAKE_COMMIT_MS = 600;

// Hoisted so the default is one stable array rather than a fresh literal per
// render — the hook holds it in state-shaped props and a new identity every
// render is churn nobody asked for.
const NO_CONSENTS: readonly string[] = [];

export function PreviewSignupPanel({
  product,
  requiredConsentSlugs = NO_CONSENTS,
  // TEMP — strip before merge.
  fillerConsents,
  state,
  authState,
  summaryHref,
  regionGate,
  homeLocationName,
  onLocationPicked,
}: PreviewSignupPanelProps) {
  const router = useRouter();
  const fields = useSignupPanelFields(product, authState, requiredConsentSlugs);
  const [committing, setCommitting] = useState(false);
  // The location dialog is the panel adapter's, here as in production — the
  // view asks for it and this is what owns whether it is open.
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);

  // Both the enrol and waitlist CTAs land on the same summary preview (which
  // derives the enrolled-vs-waitlisted variant from the scenario). Flip
  // `committing` synchronously before the wait so the CTA can't re-enable, then
  // navigate — the same commit-then-navigate shape as the real panel.
  const goToSummary = () => {
    setCommitting(true);
    setTimeout(() => router.push(summaryHref), FAKE_COMMIT_MS);
  };

  /**
   * The profile write a real save makes has nothing to write to here, so it is
   * faked at the same length the CTA's commit is — long enough that the
   * button's committing state is the beat a parent actually sees. What is not
   * faked is the consequence: the picked country goes back to the scene, the
   * gate re-derives, and the panel answers as it would in production.
   */
  const saveLocation = async (pick: LocationPick) => {
    await new Promise((resolve) => setTimeout(resolve, FAKE_COMMIT_MS));
    // Reported whatever it carries, exactly as the live adapter reports it — a
    // row with no country included, since the gate fails that open rather than
    // re-asking a question the parent has just answered.
    onLocationPicked?.({
      countryCode: pick.location.country_code,
      name: localizedLocationName(pick.location, fields.locale),
    });
  };

  return (
    <>
      <SignupPanelView
        {...fields}
        state={state}
        authState={authState}
        regionGate={
          regionGate && {
            gate: regionGate,
            locationName: homeLocationName ?? null,
            onSetLocation: () => setLocationDialogOpen(true),
          }
        }
        onAddGamer={() => {}}
        onSubmit={goToSummary}
        onJoinWaitlist={goToSummary}
        submitting={committing}
        // TEMP — strip before merge.
        previewFillerConsents={fillerConsents}
      />
      <SetLocationDialog
        open={locationDialogOpen}
        onOpenChange={setLocationDialogOpen}
        onSave={saveLocation}
      />
    </>
  );
}
