import { describe, it, expect } from "vitest";
import { detectLocaleFromHeader } from "@/lib/constants/locales";

describe("detectLocaleFromHeader", () => {
  it("returns default for null header", () => {
    expect(detectLocaleFromHeader(null)).toBe("en");
  });

  it("returns default for empty string", () => {
    expect(detectLocaleFromHeader("")).toBe("en");
  });

  it("picks a supported primary language", () => {
    expect(detectLocaleFromHeader("fi-FI,en;q=0.9")).toBe("fi");
  });

  it("skips unsupported primary and picks supported secondary", () => {
    expect(detectLocaleFromHeader("de-DE,fi;q=0.9,en;q=0.8")).toBe("fi");
  });

  it("skips multiple unsupported languages to find a match", () => {
    expect(detectLocaleFromHeader("ja,zh;q=0.9,fr;q=0.8,sv;q=0.7")).toBe("sv");
  });

  it("returns default when no language is supported", () => {
    expect(detectLocaleFromHeader("de-DE,fr;q=0.9,ja;q=0.8")).toBe("en");
  });

  it("respects quality ordering over header position", () => {
    expect(detectLocaleFromHeader("fi;q=0.8,sv;q=0.9")).toBe("sv");
  });

  it("handles wildcard entries without crashing", () => {
    expect(detectLocaleFromHeader("*;q=0.5,fi;q=0.9")).toBe("fi");
  });

  it("handles single supported locale without region", () => {
    expect(detectLocaleFromHeader("sv")).toBe("sv");
  });
});
