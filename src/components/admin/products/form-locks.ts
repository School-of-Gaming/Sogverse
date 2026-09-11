// Temporary UI-only locks on the admin product form.
//
// Several "When" / "Registration" behaviours are wired end-to-end but not yet
// signed off for production. Rather than hide them, the form pins each to a
// safe default and disables the control so an admin can't reach a not-ready
// path. These are *UI blocks only* — the API trusts admins and enforces nothing
// here. Flip a flag to `false` (and the disabled wiring that reads it falls
// away, restoring the full control) when the feature ships.
//
// Locks can also lift per product — see `formLocksFor()` below, which unlocks
// the registration window for municipality clubs and keeps it locked everywhere
// else.
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
  /** Registration always opens immediately (no scheduled ticket drop). */
  registrationTiming: boolean;
}

export const FORM_LOCKS: FormLocks = {
  startMode: true,
  registrationTiming: true,
};

/**
 * The locks in effect for the product being edited. This is the single place
 * that decides which products have which features — the form sections and
 * `initialState` resolve through it rather than reading FORM_LOCKS directly.
 *
 *   - **Municipality clubs** — the registration window is signed off.
 *   - **Everything else** keeps the global pre-prod locks. Events briefly
 *     unlocked the registration window (the scheduled ticket drop writes only
 *     `registration_opens_at`, which the parent-facing state machine already
 *     renders a pre-open countdown for) and that is reverted: a consumer-facing
 *     product opens for signup right away, and an event is no different from a
 *     club or a camp in that respect. Leaving the chooser editable made "when
 *     does registration open?" a question an admin had to answer on every
 *     event, next to a date field that means something else entirely — and the
 *     wrong answer there is invisible until a family cannot sign up.
 *
 * It is a pure function of the type config: nothing left here depends on live
 * form state.
 */
export function formLocksFor(config: ProductTypeConfig): FormLocks {
  if (config.productType === "municipality_club") {
    return { ...FORM_LOCKS, registrationTiming: false };
  }
  return FORM_LOCKS;
}
