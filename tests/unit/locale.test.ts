import { describe, it, expect } from "vitest";
import { detectLanguageFromHeader } from "@/lib/constants/language-preference";

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

