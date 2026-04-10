import { describe, it, expect } from "vitest";
import { parseAcceptLanguage } from "@/lib/locale";

describe("parseAcceptLanguage", () => {
  it("returns null for null input", () => {
    expect(parseAcceptLanguage(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseAcceptLanguage("")).toBeNull();
  });

  it("extracts a single locale", () => {
    expect(parseAcceptLanguage("fi-FI")).toBe("fi-FI");
  });

  it("returns the highest quality locale", () => {
    expect(parseAcceptLanguage("fi-FI,fi;q=0.9,en;q=0.8")).toBe("fi-FI");
  });

  it("handles explicit q=1.0", () => {
    expect(parseAcceptLanguage("en;q=0.8,de;q=1.0")).toBe("de");
  });

  it("picks first when qualities are equal (implicit q=1)", () => {
    expect(parseAcceptLanguage("en-US,en-GB")).toBe("en-US");
  });

  it("handles whitespace around entries", () => {
    expect(parseAcceptLanguage("  fr-FR , en-US;q=0.9 ")).toBe("fr-FR");
  });

  it("handles wildcard", () => {
    expect(parseAcceptLanguage("*;q=0.5,en-US;q=0.9")).toBe("en-US");
  });

  it("treats invalid q as 0", () => {
    expect(parseAcceptLanguage("en;q=abc,fi")).toBe("fi");
  });
});

