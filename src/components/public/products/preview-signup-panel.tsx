"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductBrowseRow } from "@/types";
import { SignupPanelView, type AuthState } from "./signup-panel-view";
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
  state: RegistrationState;
  authState: AuthState;
  /** Where the CTA lands — the matching `/preview/confirmation/<scenario>`. */
  summaryHref: string;
  /** Forwarded verbatim to the view — the draft detail page's rail sets it.
   *  Presentation only; see `SignupPanelViewProps.flat`. */
  flat?: boolean;
}

// Long enough that the "Signing up…" state is visibly the same beat a real
// commit takes, short enough not to annoy someone clicking through demos.
const FAKE_COMMIT_MS = 600;

export function PreviewSignupPanel({
  product,
  state,
  authState,
  summaryHref,
  flat,
}: PreviewSignupPanelProps) {
  const router = useRouter();
  const fields = useSignupPanelFields(product, authState);
  const [committing, setCommitting] = useState(false);

  // Both the enrol and waitlist CTAs land on the same summary preview (which
  // derives the enrolled-vs-waitlisted variant from the scenario). Flip
  // `committing` synchronously before the wait so the CTA can't re-enable, then
  // navigate — the same commit-then-navigate shape as the real panel.
  const goToSummary = () => {
    setCommitting(true);
    setTimeout(() => router.push(summaryHref), FAKE_COMMIT_MS);
  };

  return (
    <SignupPanelView
      {...fields}
      state={state}
      authState={authState}
      onAddGamer={() => {}}
      onSubmit={goToSummary}
      onJoinWaitlist={goToSummary}
      submitting={committing}
      flat={flat}
    />
  );
}
