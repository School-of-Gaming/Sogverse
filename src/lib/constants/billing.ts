// =============================================================================
// BILLING MODE constants
// =============================================================================
//
// This file owns the one question the codebase keeps asking about a product's
// `billing_mode` and kept re-spelling inline: **does anyone pay us for this
// seat?**
//
// The enum has three members and they are not three equal alternatives. `paid`
// is one thing; `free` and `external_contract` are two ways of being the other
// thing, and when the team says "free" out loud it almost always means both of
// them — a genuinely free product AND a municipality club, whose seats are
// invoiced to the municipality off-platform (municipality clubs are currently
// the only consumer of `external_contract`). Naming the set is how that
// colloquial "free" gets a home in the code without the code losing the
// distinction.
//
// **The distinction stays load-bearing.** The two modes buy different purchase
// shapes — `free` takes the `free` shape and `external_contract` takes the
// `external` one, each gated on its own mode — so anywhere the answer differs
// per mode, the exhaustive branch is correct and this set is the wrong tool.
// Reach for it only where the question really is two-versus-paid: whether money
// is involved at all.
//
// Lockstep: the same predicate exists in Postgres as
// `public.is_no_charge(public.billing_mode)`, introduced in migration 00206 and
// called by the enrollment writers. The two are one rule in two languages —
// widen one and you must widen the other in the same change, or the admin panel
// and the database start disagreeing about where a seat lands.

import type { BillingMode } from "@/types";

/**
 * The billing modes under which nobody pays us for a seat: `free`, and
 * `external_contract` (invoiced off-platform).
 *
 * `satisfies readonly BillingMode[]` rather than a hand-written type: a member
 * renamed or removed by a migration stops satisfying the generated union and
 * fails the compiler at the next codegen, which is the drift that matters. A
 * mode *added* to the enum deliberately does not fail here — a new mode is not
 * no-charge until somebody decides it is.
 */
export const NO_CHARGE_BILLING_MODES = [
  "free",
  "external_contract",
] as const satisfies readonly BillingMode[];

/**
 * Whether a seat under this billing mode is one nobody pays us for — the
 * two-versus-paid question, and nothing finer. See the file header for when
 * this is the wrong question to ask.
 *
 * Compared value-by-value rather than by `includes`, so a caller's `BillingMode`
 * needs no cast to be tested against the narrower literal tuple above.
 */
export function isNoChargeBillingMode(mode: BillingMode): boolean {
  return NO_CHARGE_BILLING_MODES.some((noCharge) => noCharge === mode);
}
