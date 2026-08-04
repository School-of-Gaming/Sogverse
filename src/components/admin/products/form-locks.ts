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
// and part of it for events, while keeping them locked everywhere else.
//
// Defaults that pair with these locks live in `initialState` (product-form-state.ts);
// the disabling lives in the individual section components. Both read the
// *resolved* locks for the product, never FORM_LOCKS directly.
//
// Typed as `boolean` (not literal `true`) on purpose: these are toggles, so the
// `lock ? … : …` branches in the form are genuine conditionals, not dead code.
import { effectiveBillingMode } from "./product-type-config";
import type { PaidMode, ProductTypeConfig } from "./product-type-config";

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
   * there is no window to oversell in. That is why municipality clubs (invoiced
   * off-platform) and **free** events are unlocked below while a **paid** event
   * is not — the free/paid switch flips this lock mid-form.
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
 * It takes the type config plus the **raw free/paid form state** because one
 * lock genuinely depends on the billing mode: seats (and with them the
 * waitlist) are safe wherever signup can't be interleaved with a Stripe
 * Checkout, which is a fact about the money, not the type. An event's radio
 * moves that mode while the form is open, so the locks re-resolve every render.
 *
 * **Resolving the effective mode is deliberately done in here, not by the
 * caller.** A resolved-mode parameter would have the same type as the config's
 * own `defaultBillingMode`, so passing that instead would compile — and quietly
 * unlock the cap on a paid event, which is the exact failure this file exists
 * to prevent. Taking the state the caller actually holds makes the wrong call
 * unrepresentable.
 *
 *   - **Municipality clubs** — seats, waitlist and the registration window are
 *     all signed off. Always `external_contract`, so `paidMode` is moot here.
 *   - **Events** — the registration window is signed off unconditionally: the
 *     scheduled ticket drop only sets `registration_opens_at`, and the
 *     parent-facing state machine already renders a pre-open countdown for it.
 *     Seats and the waitlist unlock only while the event is **free**; picking
 *     Paid re-locks them (see the `seatCount` doc above for why).
 *   - **Everything else** keeps the global pre-prod locks.
 */
export function formLocksFor(
  config: ProductTypeConfig,
  paidMode: PaidMode,
): FormLocks {
  if (config.productType === "municipality_club") {
    return {
      ...FORM_LOCKS,
      seatCount: false,
      waitlist: false,
      registrationTiming: false,
    };
  }
  if (config.productType === "event") {
    const capacityIsSafe = effectiveBillingMode(config, paidMode) === "free";
    return {
      ...FORM_LOCKS,
      seatCount: !capacityIsSafe,
      waitlist: !capacityIsSafe,
      registrationTiming: false,
    };
  }
  return FORM_LOCKS;
}
