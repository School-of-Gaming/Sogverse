import { describe, it, expect } from "vitest";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";

// Fallback chain: user-locale → en → first available. The exact ordering
// matters — every translated entity (product, topic, tag) reads through
// this function on the client. A swap of en with "first" or "last"
// silently mistranslates the whole site for users whose locale isn't in
// the data.

interface Row {
  locale: string;
  name: string;
}

describe("resolveTranslation", () => {
  it("returns null for an empty array", () => {
    expect(resolveTranslation<Row>([], "en")).toBeNull();
  });

  it("returns null for null/undefined input", () => {
    expect(resolveTranslation<Row>(null, "en")).toBeNull();
    expect(resolveTranslation<Row>(undefined, "en")).toBeNull();
  });

  it("prefers an exact locale match", () => {
    const rows: Row[] = [
      { locale: "en", name: "English" },
      { locale: "fi", name: "Finnish" },
      { locale: "sv", name: "Swedish" },
    ];
    expect(resolveTranslation(rows, "sv")?.name).toBe("Swedish");
  });

  it("falls back to en when the user's locale is missing", () => {
    const rows: Row[] = [
      { locale: "en", name: "English" },
      { locale: "fi", name: "Finnish" },
    ];
    expect(resolveTranslation(rows, "sv")?.name).toBe("English");
  });

  it("falls back to the first row when neither user-locale nor en exist", () => {
    const rows: Row[] = [
      { locale: "fi", name: "Finnish" },
      { locale: "tlh", name: "Klingon" },
    ];
    expect(resolveTranslation(rows, "sv")?.name).toBe("Finnish");
  });

  it("falls back to the first row when only non-en locales are present", () => {
    const rows: Row[] = [
      { locale: "tlh", name: "Klingon" },
      { locale: "sv", name: "Swedish" },
    ];
    expect(resolveTranslation(rows, "fi")?.name).toBe("Klingon");
  });

  it("user-locale wins over en when both exist", () => {
    const rows: Row[] = [
      { locale: "en", name: "English" },
      { locale: "fi", name: "Finnish" },
    ];
    expect(resolveTranslation(rows, "fi")?.name).toBe("Finnish");
  });
});
