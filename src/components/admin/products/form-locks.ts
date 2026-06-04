// Temporary UI-only locks on the admin product form.
//
// Several "When" / "Capacity" / "Registration" behaviours are wired end-to-end
// but not yet signed off for production. Rather than hide them, the form pins
// each to a safe default and disables the control so an admin can't reach a
// not-ready path. These are *UI blocks only* — the API trusts admins and
// enforces nothing here. Flip a flag to `false` (and the disabled wiring that
// reads it falls away, restoring the full control) when the feature ships.
//
// Defaults that pair with these locks live in `initialState` (product-form-state.ts);
// the disabling lives in the individual section components.
//
// Typed as `boolean` (not literal `true`) on purpose: these are toggles, so the
// `lock ? … : …` branches in the form are genuine conditionals, not dead code.
interface FormLocks {
  /** Start trigger is pinned to "On a specific date" (no threshold launches). */
  startMode: boolean;
  /** Consumer-club start date is pinned to today (set in initialState). */
  consumerClubStartDateToday: boolean;
  /** Holiday-calendar selection is shown as "coming soon" instead of editable. */
  holidayCalendars: boolean;
  /** Seat limits off — every product launches uncapped (no seat count). */
  seatCount: boolean;
  /** Waitlist is forced off. */
  waitlist: boolean;
  /** Registration always opens immediately. */
  registrationTiming: boolean;
}

export const FORM_LOCKS: FormLocks = {
  startMode: true,
  consumerClubStartDateToday: true,
  holidayCalendars: true,
  seatCount: true,
  waitlist: true,
  registrationTiming: true,
};
