import { describe, it, expect } from "vitest";
import { formatCurrency, formatCurrencyFromCents, sumCents } from "@/lib/money";

describe("formatCurrency", () => {
  it("formats with the given locale and currency symbol", () => {
    const result = formatCurrency(100, "eur", "en");
    expect(result).toContain("€");
    expect(result).toContain("100");
  });
});

describe("formatCurrencyFromCents", () => {
  it("divides cents by 100 before formatting", () => {
    const result = formatCurrencyFromCents(1500, "eur", "en");
    expect(result).toContain("€");
    expect(result).toContain("15");
  });
});

describe("sumCents", () => {
  it("adds an ordinary run of cents", () => {
    expect(sumCents([1, 2, 3])).toBe(6);
    expect(sumCents([])).toBe(0);
  });

  it("throws rather than hand back a total that is not an integer", () => {
    // The guard is the point: money is integer cents, and a fractional value
    // reaching a total means something upstream divided before it summed.
    expect(() => sumCents([1.5, 1])).toThrow(/safe integer/);
  });

  it("throws rather than hand back a total past the safe range", () => {
    expect(() =>
      sumCents([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]),
    ).toThrow(/safe integer/);
  });
});
