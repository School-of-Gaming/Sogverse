"use client";

import { ROUTES } from "@/lib/constants";
import { FamilyService } from "./family.service";
import type { FamilyMember } from "./family.contracts";

/**
 * Where a switch lands when the caller has no opinion: the dashboard belonging
 * to the account just entered.
 */
function dashboardFor(role: FamilyMember["role"]): string {
  return role === "customer" ? ROUTES.customer.dashboard : ROUTES.gamer.dashboard;
}

/** What one commit may carry beyond the target. */
export interface CommitAccountSwitchOptions {
  /** A linked parent's PIN. Required when leaving a switched-in gamer session. */
  pin?: string;
  /**
   * The TARGET account's password. Required when leaving a gamer session the
   * child signed into themselves — the resulting session is then a password
   * session too, so the parent it may land on is still behind its own unlock.
   */
  password?: string;
  /** Where to land instead of the target's dashboard. */
  redirectUrl?: string;
}

/**
 * The commit step of an account switch: POST the switch, then leave the page.
 *
 * Three surfaces perform this gesture — the header account menu, the
 * /select-profile tiles, and the confirm-switch dialog — and they differ only
 * in how they render the wait and the failure. The POST and the destination do
 * not differ, so they live here once. `redirectUrl` is the one deliberate
 * variation: the dialog carries an intent marker across the switch and has to
 * land somewhere other than the target's dashboard.
 *
 * This is only the commit. It owns no state: it holds no `committing` flag and
 * catches nothing, because the three call sites genuinely need different
 * handling (a per-tile spinner, a whole-panel disable, a dialog that stays
 * open). A shared hook owning that state was tried here and rejected. Each
 * caller flips its own flag synchronously *before* calling this, and leaves it
 * set on success — the returned promise resolves into a document that is
 * already unloading.
 *
 * **The credentials are the caller's to collect, not this function's to
 * prompt for.** Leaving a gamer session costs something: a linked parent's PIN
 * from a switched-in session, or the target account's own password from a
 * session the child signed into. Which of the two the route will demand is a
 * fact about the caller's session (see `session-provenance.ts`), and the
 * switcher knows it before the click — so a gate dialog collects the value and
 * hands it here. A commit sent without the value the route wants comes back as a
 * `SwitchAccountError` naming which one was missing, which is what lets a
 * surface open its dialog on the refusal rather than pre-empting it.
 *
 * Failure is thrown, always as a `SwitchAccountError` carrying the route's code
 * where there is one; nothing is caught here, for the same reason no state is
 * held here.
 */
export async function commitAccountSwitch(
  target: FamilyMember,
  options: CommitAccountSwitchOptions = {},
): Promise<void> {
  const { redirectUrl, ...credentials } = options;
  await new FamilyService().switchAccount(target.id, credentials);
  // Full-page navigation so the new session cookies hydrate the root layout —
  // the browser Supabase client is seeded from cookies at construction time,
  // so only a document reload rebuilds it.
  window.location.href = redirectUrl ?? dashboardFor(target.role);
}
