import { describe, it, expect } from "vitest";
import { detectCurrencyFromLocale, isSupportedCurrency } from "@/lib/constants/currency";

describe("detectCurrencyFromLocale", () => {
  it("maps en-US to usd", () => {
    expect(detectCurrencyFromLocale("en-US")).toBe("usd");
  });

  it("maps en-GB to gbp", () => {
    expect(detectCurrencyFromLocale("en-GB")).toBe("gbp");
  });

  it("maps de-DE to eur", () => {
    expect(detectCurrencyFromLocale("de-DE")).toBe("eur");
  });

  it("maps fr to eur (language-only code)", () => {
    expect(detectCurrencyFromLocale("fr")).toBe("eur");
  });

  it("maps es-ES to eur", () => {
    expect(detectCurrencyFromLocale("es-ES")).toBe("eur");
  });

  it("maps it to eur (language-only code)", () => {
    expect(detectCurrencyFromLocale("it")).toBe("eur");
  });

  it("maps nl-NL to eur", () => {
    expect(detectCurrencyFromLocale("nl-NL")).toBe("eur");
  });

  it("maps unknown locale to eur (default)", () => {
    expect(detectCurrencyFromLocale("ja-JP")).toBe("eur");
  });

  it("maps empty string to eur (default)", () => {
    expect(detectCurrencyFromLocale("")).toBe("eur");
  });

  it("maps en (no region) to eur (default)", () => {
    expect(detectCurrencyFromLocale("en")).toBe("eur");
  });
});

describe("isSupportedCurrency", () => {
  it("returns true for usd", () => {
    expect(isSupportedCurrency("usd")).toBe(true);
  });

  it("returns true for gbp", () => {
    expect(isSupportedCurrency("gbp")).toBe(true);
  });

  it("returns true for eur", () => {
    expect(isSupportedCurrency("eur")).toBe(true);
  });

  it("returns false for uppercase USD", () => {
    expect(isSupportedCurrency("USD")).toBe(false);
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
