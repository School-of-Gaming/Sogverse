import { track } from "@vercel/analytics";
import type {
  UserRole,
  SupportedLocale,
  DetectedLocale,
} from "@/lib/constants";

/**
 * How a user reached their dashboard ("My SOG").
 *   - "logo"             — the SOG logo in the header (all dashboard roles).
 *   - "account_menu"     — the My SOG / Dashboard row in the header's account
 *                          menu (all roles). Replaces "avatar", whose series
 *                          ended when the avatar stopped being a link and
 *                          became the menu trigger — the mechanism changed, so
 *                          the name changed with it rather than letting a
 *                          two-click path report under a one-click name.
 *   - "profile_selector" — picking their own tile on /select-profile
 *                          (parents/gamers).
 */
export type DashboardNavMethod = "logo" | "account_menu" | "profile_selector";

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
 * So `from !== detected` is a sound reading of "someone changing their mind
 * again": the locale that was showing already diverges from the browser's
 * guess, so a choice had been made before this one.
 *
 * **The mirror case is weaker than it looks, and this is the note to read
 * before reading the numbers.** `from === detected && to !== detected` supports
 * only "they had not previously overridden the detected locale into something
 * that diverges from it" — *not* "they are correcting the browser's guess
 * now". Registration seeds a new profile's stored locale from the same header
 * this property reports, so a parent who was detected as Finnish, used the app
 * happily in Finnish for six months and only then switched to English emits a
 * row identical to a genuine first-day correction; so does everyone who has
 * simply never touched the picker. Nothing we record distinguishes a stored
 * locale that was auto-seeded from detection from one the user deliberately
 * chose, so the two collapse into one bucket. Separating them properly would
 * take a stored "what we originally detected for this account" value, which
 * this deliberately does not add — the event shape is not where that gap gets
 * closed, so don't try to patch it with another property.
 *
 * The comparison that *is* available has to live inside one event because
 * Vercel's `visitor_id` rotates daily — per-person sequences cannot be
 * reconstructed at read time, so anything we want to compare has to be
 * compared here.
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
