import { describe, expect, it } from "vitest";
import {
  localeTabAfterRemoving,
  openingLocaleTab,
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
