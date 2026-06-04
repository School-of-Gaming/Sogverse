import { describe, it, expect } from "vitest";
import {
  isSupportedCurrency,
  SUPPORTED_CURRENCIES,
  DEFAULT_CURRENCY,
} from "@/lib/constants/currency";

// The platform is locked to EUR (see src/lib/constants/currency.ts). These
// tests guard the lockdown: only `eur` is supported until currencies are
// deliberately re-enabled.

describe("EUR-only lockdown", () => {
  it("supports exactly eur", () => {
    expect([...SUPPORTED_CURRENCIES]).toEqual(["eur"]);
  });

  it("defaults to eur", () => {
    expect(DEFAULT_CURRENCY).toBe("eur");
  });
});

describe("isSupportedCurrency", () => {
  it("returns true for eur", () => {
    expect(isSupportedCurrency("eur")).toBe(true);
  });

  it("returns false for gbp (locked down)", () => {
    expect(isSupportedCurrency("gbp")).toBe(false);
  });

  it("returns false for usd (locked down)", () => {
    expect(isSupportedCurrency("usd")).toBe(false);
  });

  it("returns false for uppercase EUR", () => {
    expect(isSupportedCurrency("EUR")).toBe(false);
  });

  it("returns false for unknown currency", () => {
    expect(isSupportedCurrency("jpy")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isSupportedCurrency(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isSupportedCurrency(undefined)).toBe(false);
  });

  it("returns false for number", () => {
    expect(isSupportedCurrency(42)).toBe(false);
  });
});
