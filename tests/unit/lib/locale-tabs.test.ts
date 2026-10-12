import { describe, expect, it } from "vitest";
import {
  addLocaleTab,
  checkLocaleDrafts,
  localeTabAfterRemoving,
  openingLocaleTab,
  removeLocaleTab,
  writtenLocales,
} from "@/lib/i18n/locale-tabs";

/**
 * The language tab the product, Library and Team editors show: one rule for
 * all three, so an admin meets one behaviour wherever they write per locale.
 */

describe("the tab an existing item opens on", () => {
  it("is the admin's own locale when it was written", () => {
    expect(openingLocaleTab(["sv", "en", "fi"], "fi")).toBe("fi");
  });

  it("falls back to English, then the first written, as a reader is shown", () => {
    expect(openingLocaleTab(["sv", "en"], "fi")).toBe("en");
    expect(openingLocaleTab(["sv", "fr"], "fi")).toBe("sv");
  });

  it("is the admin's own locale when nothing was written", () => {
    expect(openingLocaleTab([], "fr")).toBe("fr");
  });
});

describe("the tab shown after one is removed", () => {
  it("stays put when another tab was removed", () => {
    expect(localeTabAfterRemoving({ en: 1, sv: 1 }, "sv", "fi", "fi")).toBe("sv");
  });

  it("moves to the first remaining tab in the site's locale order", () => {
    expect(localeTabAfterRemoving({ sv: 1, en: 1 }, "fi", "fi", "fi")).toBe("en");
  });

  it("falls back to the admin's own locale when no tab remains", () => {
    expect(localeTabAfterRemoving({}, "sv", "sv", "fi")).toBe("fi");
  });
});

describe("the tab set", () => {
  it("lists the written locales in the site's locale order", () => {
    expect(writtenLocales({ sv: "x", en: "y", tlh: "z" })).toEqual(["en", "sv", "tlh"]);
  });

  it("opens a new tab seeded with its draft and shows it", () => {
    expect(addLocaleTab({ drafts: { en: "a" }, active: "en" }, "fi", "")).toEqual({
      drafts: { en: "a", fi: "" },
      active: "fi",
    });
  });

  it("discards a closed tab's draft and moves off it when it was shown", () => {
    const before = { drafts: { en: "a", fi: "b", sv: "c" }, active: "fi" as const };
    expect(removeLocaleTab(before, "fi", "fi")).toEqual({
      drafts: { en: "a", sv: "c" },
      active: "en",
    });
    expect(removeLocaleTab(before, "sv", "fi")).toEqual({
      drafts: { en: "a", fi: "b" },
      active: "fi",
    });
    // The state it was handed is untouched.
    expect(before.drafts).toEqual({ en: "a", fi: "b", sv: "c" });
  });
});

describe("the per-locale drafts rule", () => {
  const filled = (draft: string) => draft.trim() !== "";

  it("accepts any single complete locale", () => {
    expect(checkLocaleDrafts({ sv: "Klubb" }, filled)).toBeNull();
  });

  it("asks for one complete locale when none is", () => {
    expect(checkLocaleDrafts({ en: "  " }, filled)).toEqual({ kind: "none" });
    expect(checkLocaleDrafts({}, filled)).toEqual({ kind: "none" });
  });

  it("names the first half-written tab in the site's locale order", () => {
    expect(checkLocaleDrafts({ sv: "", en: "Club", fi: "" }, filled)).toEqual({
      kind: "incomplete",
      locale: "fi",
    });
  });
});
