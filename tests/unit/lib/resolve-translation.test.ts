import { describe, it, expect } from "vitest";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";

// Fallback chain: user-locale → en → fi → first available. The exact
// ordering matters — every translated entity (product, topic, tag) reads
// through this function on the client. A swap of fi/en or of "first
// available" with "last" silently mistranslates the whole site for users
// whose locale isn't in the data.

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

  it("falls back to fi when both the user's locale and en are missing", () => {
    const rows: Row[] = [
      { locale: "fi", name: "Finnish" },
      { locale: "tlh", name: "Klingon" },
    ];
    expect(resolveTranslation(rows, "sv")?.name).toBe("Finnish");
  });

  it("falls back to the first row when neither user-locale nor en/fi exist", () => {
    const rows: Row[] = [
      { locale: "tlh", name: "Klingon" },
      { locale: "sv", name: "Swedish" },
    ];
    // Neither tlh nor en/fi == user's locale of, say, fi
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
