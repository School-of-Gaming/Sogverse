import { track } from "@vercel/analytics";
import type { UserRole } from "@/lib/constants";

/**
 * How a user reached their dashboard ("My SOG").
 *   - "logo"             — the SOG logo in the header (all dashboard roles).
 *   - "avatar"           — the header avatar going straight to the dashboard
 *                          (gedus only; parents/gamers' avatar opens the
 *                          family selector instead).
 *   - "profile_selector" — picking their own tile on /select-profile
 *                          (parents/gamers).
 */
export type DashboardNavMethod = "logo" | "avatar" | "profile_selector";

/**
 * Records how a user chose to navigate to their dashboard, so we can compare
 * the logo vs. avatar vs. profile-selector paths per role. `from` is the route
 * they clicked from (their previous screen) — for the profile-selector path
 * this is always /select-profile, since that's where the self-tile lives.
 *
 * Vercel Web Analytics sends the event via `navigator.sendBeacon`, so it
 * survives the full-page navigation the selector triggers. Event properties
 * are deliberately identifier-free (role/method/route only) — never a name,
 * email, or user id — see the privacy policy's analytics section.
 */
export function trackDashboardNav(params: {
  role: UserRole;
  method: DashboardNavMethod;
  from: string;
}): void {
  track("dashboard_nav", { ...params });
}
