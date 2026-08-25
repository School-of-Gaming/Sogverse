import { track } from "@vercel/analytics";
import type { UserRole, SupportedLocale } from "@/lib/constants";

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

/**
 * What this request's `Accept-Language` header negotiated to — a supported
 * locale, or `"none"` when the browser asked only for languages we don't ship
 * (or sent no header at all).
 *
 * `"none"` is a distinct value on purpose. The render path folds every
 * no-match case into English, but for measurement that conflation is fatal: a
 * German-only visitor switching to French would otherwise read as "overrode a
 * correct English guess", when the finding is really "we don't ship their
 * language". One is a detection bug, the other is a roadmap item.
 */
export type DetectedLocale = SupportedLocale | "none";

/**
 * Records a locale change made in the header's LocalePicker, so we can tell
 * whether people accept the browser-derived default or override it — and, when
 * they override it, what they were correcting.
 *
 * The three properties are what make a single event readable on its own:
 *   - `to`       — the locale they just picked.
 *   - `from`     — the locale that was showing when they picked it, which may
 *                  itself be an earlier choice of theirs (cookie or profile).
 *   - `detected` — what `Accept-Language` negotiated, read straight from the
 *                  header and independent of cookie/profile.
 *
 * So `from === detected && to !== detected` is a first correction of a wrong
 * browser guess, while `from !== detected` is someone changing their mind again
 * later. That distinction has to live inside one event because Vercel's
 * `visitor_id` rotates daily — per-person sequences cannot be reconstructed at
 * read time, so anything we want to compare has to be compared here.
 *
 * Not fired when the picked locale is the one already showing: the picker lets
 * you click the active entry, and a no-op row would dilute the from/to matrix.
 *
 * Event properties are deliberately identifier-free (locale codes only) — never
 * a name, email, or user id — see the privacy policy's analytics section. The
 * page and route are attached by Vercel automatically, so neither is a property
 * here.
 */
export function trackLocaleChange(params: {
  detected: DetectedLocale;
  from: SupportedLocale;
  to: SupportedLocale;
}): void {
  track("locale_change", { ...params });
}

/**
 * Records the LocalePicker dropdown being opened (the closed → open transition
 * only — closing it again is not a second event).
 *
 * This is what disambiguates a visitor who never fires `locale_change`: without
 * it, "never noticed the selector" and "noticed it and was happy with the
 * language" are the same silence. An open with no change following it is the
 * second of those.
 *
 * Same privacy shape as `trackLocaleChange` above — locale codes only.
 */
export function trackLocalePickerOpen(params: {
  detected: DetectedLocale;
  current: SupportedLocale;
}): void {
  track("locale_picker_open", { ...params });
}
