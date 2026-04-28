import { describe, it, expect } from "vitest";
import {
  applyFxAutoFill,
  type FxRates,
  type PricesMap,
} from "@/components/admin/products-v2/pricing-block-fx";
import type { SupportedCurrency } from "@/lib/constants";

// FX auto-fill: when admin types in EUR (the source), every other currency
// gets re-filled from EUR × today's rate. Currencies the admin has manually
// edited (the "manualEdits" lock set) are skipped — that lock is sticky.
//
// The component used to inline this logic in a useEffect. Subtle bits:
//   - returns null when no change is needed (otherwise the effect would
//     re-fire on its own state update and the form thrashes)
//   - empty EUR ⇒ no fill at all (nothing to derive from)
//   - upfront_total shape ⇒ month is always blanked on non-EUR

const RATES: FxRates = { eur: 1, gbp: 0.86, usd: 1.07 };

function pricesOf(
  eur: { session: string; month: string },
  gbp: { session: string; month: string } = { session: "", month: "" },
  usd: { session: string; month: string } = { session: "", month: "" },
): PricesMap {
  return { eur, gbp, usd };
}

describe("applyFxAutoFill", () => {
  it("returns null when fxRates is undefined", () => {
    const result = applyFxAutoFill({
      prices: pricesOf({ session: "10", month: "30" }),
      manualEdits: new Set(),
      shape: "session_and_month",
      fxRates: undefined,
    });
    expect(result).toBeNull();
  });

  it("returns null when EUR session and month are both empty", () => {
    const result = applyFxAutoFill({
      prices: pricesOf({ session: "", month: "" }),
      manualEdits: new Set(),
      shape: "session_and_month",
      fxRates: RATES,
    });
    expect(result).toBeNull();
  });

  it("fills GBP and USD from EUR for session_and_month", () => {
    const result = applyFxAutoFill({
      prices: pricesOf({ session: "10", month: "30" }),
      manualEdits: new Set(),
      shape: "session_and_month",
      fxRates: RATES,
    });
    expect(result).not.toBeNull();
    expect(result!.gbp).toEqual({ session: "8.60", month: "25.80" });
    expect(result!.usd).toEqual({ session: "10.70", month: "32.10" });
    // EUR is never overwritten by auto-fill — admin types it.
    expect(result!.eur).toEqual({ session: "10", month: "30" });
  });

  it("blanks the month field on non-EUR currencies for upfront_total", () => {
    const result = applyFxAutoFill({
      prices: pricesOf({ session: "100", month: "" }),
      manualEdits: new Set(),
      shape: "upfront_total",
      fxRates: RATES,
    });
    expect(result!.gbp).toEqual({ session: "86.00", month: "" });
    expect(result!.usd).toEqual({ session: "107.00", month: "" });
  });

  it("skips currencies that are in manualEdits (sticky lock)", () => {
    const result = applyFxAutoFill({
      prices: pricesOf(
        { session: "10", month: "30" },
        { session: "9999", month: "9999" }, // admin's manual override
      ),
      manualEdits: new Set<SupportedCurrency>(["gbp"]),
      shape: "session_and_month",
      fxRates: RATES,
    });
    expect(result).not.toBeNull();
    // GBP is locked — should not change.
    expect(result!.gbp).toEqual({ session: "9999", month: "9999" });
    // USD is unlocked — should be filled.
    expect(result!.usd.session).toBe("10.70");
  });

  it("returns null when every non-EUR currency is locked (no work to do)", () => {
    const result = applyFxAutoFill({
      prices: pricesOf({ session: "10", month: "30" }),
      manualEdits: new Set<SupportedCurrency>(["gbp", "usd"]),
      shape: "session_and_month",
      fxRates: RATES,
    });
    expect(result).toBeNull();
  });

  it("returns null when current values already match the FX projection", () => {
    // Already auto-filled — calling again should noop.
    const result = applyFxAutoFill({
      prices: pricesOf(
        { session: "10", month: "30" },
        { session: "8.60", month: "25.80" },
        { session: "10.70", month: "32.10" },
      ),
      manualEdits: new Set(),
      shape: "session_and_month",
      fxRates: RATES,
    });
    expect(result).toBeNull();
  });

  it("blanks the session field on non-EUR when EUR session is empty but month is set", () => {
    const result = applyFxAutoFill({
      prices: pricesOf({ session: "", month: "30" }),
      manualEdits: new Set(),
      shape: "session_and_month",
      fxRates: RATES,
    });
    expect(result!.gbp).toEqual({ session: "", month: "25.80" });
  });

  it("rounds to two decimal places (toFixed(2))", () => {
    const result = applyFxAutoFill({
      prices: pricesOf({ session: "9.99", month: "" }),
      manualEdits: new Set(),
      shape: "upfront_total",
      fxRates: RATES,
    });
    // 9.99 * 0.86 = 8.5914 → "8.59"
    expect(result!.gbp.session).toBe("8.59");
    // 9.99 * 1.07 = 10.6893 → "10.69"
    expect(result!.usd.session).toBe("10.69");
  });
});
