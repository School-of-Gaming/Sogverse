import { describe, it, expect } from "vitest";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";

// The pick: reader's locale → en → the earliest written locale in the app's
// locale order (en, fi, sv, fr, tlh, then unknown codes by code). Every
// surface showing a piece of content reads through this function, so the pick
// must depend only on which locales are present, never on the rows' order.

interface Row {
  locale: string;
  name: string;
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  );
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
      { locale: "fi", name: "Finnish" },
      { locale: "en", name: "English" },
    ];
    expect(resolveTranslation(rows, "sv")?.name).toBe("English");
  });

  it("user-locale wins over en when both exist", () => {
    const rows: Row[] = [
      { locale: "en", name: "English" },
      { locale: "fi", name: "Finnish" },
    ];
    expect(resolveTranslation(rows, "fi")?.name).toBe("Finnish");
  });

  it("falls back to the earliest locale in the app's order, not the first row", () => {
    const rows: Row[] = [
      { locale: "fr", name: "French" },
      { locale: "sv", name: "Swedish" },
    ];
    expect(resolveTranslation(rows, "fi")?.name).toBe("Swedish");
    expect(resolveTranslation(rows, "en")?.name).toBe("Swedish");
  });

  it("ranks Klingon after every real locale", () => {
    const rows: Row[] = [
      { locale: "tlh", name: "Klingon" },
      { locale: "fr", name: "French" },
    ];
    expect(resolveTranslation(rows, "sv")?.name).toBe("French");
  });

  it("ranks unknown locales after every supported one, ordered by code", () => {
    const rows: Row[] = [
      { locale: "zz", name: "Zz" },
      { locale: "de", name: "German" },
      { locale: "tlh", name: "Klingon" },
    ];
    expect(resolveTranslation(rows, "fi")?.name).toBe("Klingon");
    expect(resolveTranslation(rows.filter((r) => r.locale !== "tlh"), "fi")?.name).toBe(
      "German",
    );
  });

  it("gives the same pick for every order of the same rows", () => {
    const rows: Row[] = [
      { locale: "zz", name: "Zz" },
      { locale: "fr", name: "French" },
      { locale: "tlh", name: "Klingon" },
      { locale: "sv", name: "Swedish" },
    ];
    for (const reader of ["en", "fi", "sv", "fr", "tlh"] as const) {
      const picks = new Set(
        permutations(rows).map((order) => resolveTranslation(order, reader)?.name),
      );
      expect(picks.size, `reader ${reader}`).toBe(1);
    }
    expect(resolveTranslation(rows, "fi")?.name).toBe("Swedish");
    expect(resolveTranslation(rows, "tlh")?.name).toBe("Klingon");
  });
});
