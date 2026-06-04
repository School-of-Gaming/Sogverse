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
  /** Which single price field this product type collects: `month` for the
   *  consumer-club monthly subscription, `session` for the camp/event
   *  upfront total. The other field is always blanked for non-EUR rows. */
  shape: "monthly" | "upfront_total";
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

  const field: "session" | "month" = shape === "monthly" ? "month" : "session";
  const eurValue = Number(prices.eur[field]);
  const eurFilled = prices.eur[field] !== "" && Number.isFinite(eurValue);
  if (!eurFilled) return null;

  const targets = SUPPORTED_CURRENCIES.filter(
    (c) => c !== DEFAULT_CURRENCY && !manualEdits.has(c) && fxRates[c],
  );
  if (targets.length === 0) return null;

  const next: PricesMap = { ...prices };
  let anyChanged = false;
  for (const c of targets) {
    const converted = (eurValue * fxRates[c]).toFixed(2);
    const nextRow =
      field === "month"
        ? { session: "", month: converted }
        : { session: converted, month: "" };
    if (next[c].session !== nextRow.session || next[c].month !== nextRow.month) {
      next[c] = nextRow;
      anyChanged = true;
    }
  }
  return anyChanged ? next : null;
}
