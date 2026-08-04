// Temporary UI-only locks on the admin product form.
//
// Several "When" / "Capacity" / "Registration" behaviours are wired end-to-end
// but not yet signed off for production. Rather than hide them, the form pins
// each to a safe default and disables the control so an admin can't reach a
// not-ready path. These are *UI blocks only* — the API trusts admins and
// enforces nothing here. Flip a flag to `false` (and the disabled wiring that
// reads it falls away, restoring the full control) when the feature ships.
//
// Locks can also lift per product — see `formLocksFor()` below, which unlocks
// the seat-count / waitlist / registration-window trio for municipality clubs
// and the registration window alone for events, while keeping them locked
// everywhere else.
//
// Defaults that pair with these locks live in `initialState` (product-form-state.ts);
// the disabling lives in the individual section components. Both read the
// *resolved* locks for the product, never FORM_LOCKS directly.
//
// Typed as `boolean` (not literal `true`) on purpose: these are toggles, so the
// `lock ? … : …` branches in the form are genuine conditionals, not dead code.
import type { ProductTypeConfig } from "./product-type-config";

interface FormLocks {
  /** Start trigger is pinned to "On a specific date" (no threshold launches). */
  startMode: boolean;
  /** Consumer-club start date is pinned to today (set in initialState). */
  consumerClubStartDateToday: boolean;
  /** Holiday-calendar selection is shown as "coming soon" instead of editable. */
  holidayCalendars: boolean;
  /**
   * Seat limits off — the product launches uncapped (no seat count).
   *
   * **This lock tracks the money, not the product type.** Capacity is checked
   * before Stripe Checkout and nothing is held while the parent pays — the seat
   * is created when the payment lands — so two parents checking out at once on
   * the last seat both pass the gate and both get one. A cap is therefore only
   * safe where the signup never reaches Checkout: the no-charge shapes validate
   * the cap and write the `active` row in the *same* locked transaction, so
   * there is no window to oversell in. Municipality clubs are invoiced
   * off-platform and never go near Checkout, which is why they are unlocked
   * below.
   *
   * **A free event clears that same bar and is still locked — deliberately.**
   * It was unlocked once and walked back. The seat gate was never the blocker;
   * the parent-facing shop was. A capped event that fills up reads exactly like
   * an open one while a family is browsing — the seat bar is muni-only and the
   * full-with-waitlist call to action is the same generic one an open product
   * shows — so unlocking the cap let an admin publish a page with no way to say
   * it was full. The re-lock is a product decision, not a safety one, and it is
   * meant to lift again: TODO.md, "Event seat caps + waitlist: re-locked until
   * the shop surface can express fullness", is the list of what has to exist
   * first.
   *
   * Whoever unlocks it for a shape that does reach Checkout has to re-decide
   * the capacity hold first; migration 00139 records why the previous hold was
   * removed and what it cost, and `docs/products-architecture.md` §"Seat gate &
   * the create-on-payment rule" is the standing record of the trade.
   */
  seatCount: boolean;
  /** Waitlist is forced off. Rides with `seatCount` — a waitlist only exists
   *  behind a cap, so it is unlocked exactly where a cap is. */
  waitlist: boolean;
  /** Registration always opens immediately (no scheduled ticket drop). */
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

/**
 * The locks in effect for the product being edited. This is the single place
 * that decides which products have which features — the form sections and
 * `initialState` resolve through it rather than reading FORM_LOCKS directly.
 *
 *   - **Municipality clubs** — seats, waitlist and the registration window are
 *     all signed off.
 *   - **Events** — the registration window, and nothing else: the scheduled
 *     ticket drop only sets `registration_opens_at`, and the parent-facing
 *     state machine already renders a pre-open countdown for it.
 *   - **Everything else** keeps the global pre-prod locks.
 *
 * **It is a pure function of the type config, and that is the shape the
 * re-lock restored.** It briefly took the form's live free/paid state as a
 * second argument, back when a *free* event could be capped and picking Paid
 * had to re-lock the control mid-form. That unlock is reverted (the `seatCount`
 * doc above says why, and TODO.md carries the conditions for lifting it again),
 * so the parameter went with it rather than being left as one nothing reads —
 * an ignored argument is worse than none, because a caller passing the wrong
 * thing gets the right answer and never learns. Restoring the unlock means
 * restoring the parameter in the same change: the line between a safe cap and
 * an overselling one is drawn by the money, which is form state, not by the
 * product type.
 */
export function formLocksFor(config: ProductTypeConfig): FormLocks {
  if (config.productType === "municipality_club") {
    return {
      ...FORM_LOCKS,
      seatCount: false,
      waitlist: false,
      registrationTiming: false,
    };
  }
  if (config.productType === "event") {
    return { ...FORM_LOCKS, registrationTiming: false };
  }
  return FORM_LOCKS;
}
