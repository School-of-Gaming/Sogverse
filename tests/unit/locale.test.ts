import { describe, it, expect } from "vitest";
import { parseAcceptLanguage } from "@/lib/locale";
import { detectLanguageFromHeader } from "@/lib/constants/language-preference";

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

describe("detectLanguageFromHeader", () => {
  it("returns default for null header", () => {
    expect(detectLanguageFromHeader(null)).toBe("en");
  });

  it("returns default for empty string", () => {
    expect(detectLanguageFromHeader("")).toBe("en");
  });

  it("picks a supported primary language", () => {
    expect(detectLanguageFromHeader("fi-FI,en;q=0.9")).toBe("fi");
  });

  it("skips unsupported primary and picks supported secondary", () => {
    expect(detectLanguageFromHeader("de-DE,fi;q=0.9,en;q=0.8")).toBe("fi");
  });

  it("skips multiple unsupported languages to find a match", () => {
    expect(detectLanguageFromHeader("ja,zh;q=0.9,fr;q=0.8,sv;q=0.7")).toBe("sv");
  });

  it("returns default when no language is supported", () => {
    expect(detectLanguageFromHeader("de-DE,fr;q=0.9,ja;q=0.8")).toBe("en");
  });

  it("respects quality ordering over header position", () => {
    expect(detectLanguageFromHeader("fi;q=0.8,sv;q=0.9")).toBe("sv");
  });

  it("handles wildcard entries without crashing", () => {
    expect(detectLanguageFromHeader("*;q=0.5,fi;q=0.9")).toBe("fi");
  });

  it("handles single supported locale without region", () => {
    expect(detectLanguageFromHeader("sv")).toBe("sv");
  });
});

