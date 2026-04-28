// FX auto-fill logic for the admin pricing block. Lifted out of the
// component's useEffect so it's testable and the React side can stay a
// dumb dispatcher.
//
// Contract:
//   - EUR is the source. When the admin types in EUR, every other currency
//     gets re-filled from EUR × today's rate.
//   - "Manual edits" are sticky: once an admin types directly into a non-EUR
//     row, that currency is locked from auto-fill until the form unmounts.
//     Locking happens in `setRow` (component side, where the keystroke
//     happens); this module only *reads* the lock set.
//   - When EUR is empty, no auto-fill runs at all (nothing to derive from).
//   - Returns `null` if nothing would change. The caller uses the null
//     short-circuit to avoid an unnecessary onChange/state-update cycle —
//     otherwise the effect re-fires on its own update.
//
// Note: keep this module React-free. The component imports the function
// and passes the result through onChange().

import {
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
} from "@/lib/constants";

export type FxRates = Record<SupportedCurrency, number>;

export type PricesMap = Record<
  SupportedCurrency,
  { session: string; month: string }
>;

export interface FxAutoFillInputs {
  prices: PricesMap;
  manualEdits: ReadonlySet<SupportedCurrency>;
  /** Whether the form has a separate per-month price (`session_and_month`)
   *  or a single total (`upfront_total`). For upfront_total, the month
   *  field is always blanked out for non-EUR currencies. */
  shape: "session_and_month" | "upfront_total";
  /** EUR-base rates, e.g. `{ eur: 1, gbp: 0.86, usd: 1.07 }`. */
  fxRates: FxRates | undefined;
}

/**
 * Compute the next prices map after FX auto-fill, or null if nothing
 * would change (or there's nothing to derive from).
 */
export function applyFxAutoFill({
  prices,
  manualEdits,
  shape,
  fxRates,
}: FxAutoFillInputs): PricesMap | null {
  if (!fxRates) return null;

  const eurSession = Number(prices.eur.session);
  const eurMonth = Number(prices.eur.month);
  const eurSessionFilled =
    prices.eur.session !== "" && Number.isFinite(eurSession);
  const eurMonthFilled =
    prices.eur.month !== "" && Number.isFinite(eurMonth);
  if (!eurSessionFilled && !eurMonthFilled) return null;

  const targets = SUPPORTED_CURRENCIES.filter(
    (c) => c !== DEFAULT_CURRENCY && !manualEdits.has(c) && fxRates[c],
  );
  if (targets.length === 0) return null;

  const next: PricesMap = { ...prices };
  let anyChanged = false;
  for (const c of targets) {
    const rate = fxRates[c];
    const nextSession = eurSessionFilled ? (eurSession * rate).toFixed(2) : "";
    const nextMonth =
      shape === "session_and_month" && eurMonthFilled
        ? (eurMonth * rate).toFixed(2)
        : "";
    if (next[c].session !== nextSession || next[c].month !== nextMonth) {
      next[c] = { session: nextSession, month: nextMonth };
      anyChanged = true;
    }
  }
  return anyChanged ? next : null;
}
