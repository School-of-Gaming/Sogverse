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
 * SEAM: a follow-up piece gates a switch *initiated from a gamer session*
 * behind a parent-PIN dialog. That dialog will wrap exactly this function —
 * take the PIN, then commit the target it was handed — which is why every
 * gamer-initiated call site routes through here rather than POSTing for
 * itself. Keep it free of anything belonging to a particular caller's click.
 */
export async function commitAccountSwitch(
  target: FamilyMember,
  redirectUrl?: string,
): Promise<void> {
  await new FamilyService().switchAccount(target.id);
  // Full-page navigation so the new session cookies hydrate the root layout —
  // the browser Supabase client is seeded from cookies at construction time,
  // so only a document reload rebuilds it.
  window.location.href = redirectUrl ?? dashboardFor(target.role);
}
