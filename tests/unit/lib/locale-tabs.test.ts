import { describe, expect, it } from "vitest";
import type { AuthoredBodies } from "@/lib/authored-bodies";
import type { SupportedLocale } from "@/lib/constants/locales";
import {
  NO_RICH_BODIES,
  activeLocaleDraft,
  addLocaleTab,
  checkLocaleDrafts,
  draftsToSave,
  editActiveLocaleDraft,
  isBlankLocaleDraft,
  localeTabAfterRemoving,
  newLocaleTabs,
  openLocaleTabs,
  openingLocaleTab,
  removeLocaleTab,
  sameLocaleDrafts,
  selectLocaleTab,
  writtenLocales,
} from "@/lib/i18n/locale-tabs";

/**
 * The language tabs every editor of content written per locale shows — the
 * product, Library article, spotlight, Team profile and holiday calendar
 * editors — one rule for all of them, so an admin meets one behaviour wherever
 * they write per locale: which tab opens, what adding and removing one does,
 * that a blank tab is no version, what may be saved, and whether the drafts
 * differ from the saved copy.
 */

interface Draft {
  title: string;
  body: string;
}

const EMPTY: Draft = { title: "", body: "" };
const draft = (title: string, body = ""): Draft => ({ title, body });

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

describe("opening the tabs", () => {
  it("gives a new item one empty tab, in the admin's own locale", () => {
    expect(newLocaleTabs("fi", EMPTY)).toEqual({ drafts: { fi: EMPTY }, active: "fi" });
  });

  it("opens a saved item on the tab a reader of the admin's locale is shown", () => {
    const drafts = { sv: draft("Klubb"), en: draft("Club") };
    expect(openLocaleTabs(drafts, "fi", EMPTY)).toEqual({ drafts, active: "en" });
    expect(openLocaleTabs({ sv: draft("Klubb") }, "fi", EMPTY).active).toBe("sv");
  });

  it("opens a saved item with nothing written as a new one", () => {
    expect(openLocaleTabs({}, "fr", EMPTY)).toEqual(newLocaleTabs("fr", EMPTY));
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

  it("shows another tab, keeping every draft", () => {
    const before = { drafts: { en: "a", fi: "b" }, active: "en" as const };
    expect(selectLocaleTab(before, "fi")).toEqual({ ...before, active: "fi" });
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

  it("edits only the tab being shown", () => {
    const before = { drafts: { en: draft("Club"), fi: draft("") }, active: "fi" as const };
    const after = editActiveLocaleDraft(before, { title: "Kerho" }, EMPTY);
    expect(after.drafts).toEqual({ en: draft("Club"), fi: draft("Kerho") });
    expect(activeLocaleDraft(after, EMPTY)).toEqual(draft("Kerho"));
  });
});

describe("a blank tab", () => {
  it("is one whose every field is blank once trimmed", () => {
    expect(isBlankLocaleDraft(draft(" ", "\n"))).toBe(true);
    expect(isBlankLocaleDraft(draft("", "x"))).toBe(false);
    expect(isBlankLocaleDraft({})).toBe(true);
  });

  it("is left out of a save, in the site's locale order", () => {
    expect(
      draftsToSave({ sv: draft("Klubb"), fi: draft("  "), en: draft("Club ") }),
    ).toEqual([
      { locale: "en", draft: draft("Club ") },
      { locale: "sv", draft: draft("Klubb") },
    ]);
  });
});

describe("what may be saved", () => {
  const titled = (d: Draft) => d.title.trim() !== "";

  it("accepts any single complete locale", () => {
    expect(checkLocaleDrafts({ sv: draft("Klubb") }, titled)).toBeNull();
  });

  it("asks for something written when every tab is blank", () => {
    expect(checkLocaleDrafts({ en: draft("  ") }, titled)).toEqual({ kind: "none" });
    expect(checkLocaleDrafts({}, titled)).toEqual({ kind: "none" });
  });

  it("ignores a blank tab beside a complete one", () => {
    expect(
      checkLocaleDrafts({ sv: draft(""), en: draft("Club"), fi: draft(" ") }, titled),
    ).toBeNull();
  });

  it("names the first partly written tab in the site's locale order", () => {
    expect(
      checkLocaleDrafts(
        { sv: draft("", "Text"), en: draft("Club"), fi: draft("", "Teksti") },
        titled,
      ),
    ).toEqual({ kind: "incomplete", locale: "fi" });
  });

  it("names a partly written tab even when no tab is complete", () => {
    expect(checkLocaleDrafts({ sv: draft("", "Text") }, titled)).toEqual({
      kind: "incomplete",
      locale: "sv",
    });
  });
});

describe("the drafts against the saved copy", () => {
  const saved = { en: draft("Club", "* one"), sv: draft("Klubb") };
  const untouched: AuthoredBodies = { serialised: new Map() };
  const rich = { fields: ["body"] as const, bodies: untouched };

  it("is the same when every field is the same once trimmed", () => {
    expect(
      sameLocaleDrafts({ sv: draft(" Klubb "), en: draft("Club", "* one\n") }, saved, rich),
    ).toBe(true);
  });

  it("is compared locale by locale, not by position", () => {
    expect(
      sameLocaleDrafts({ en: draft("Klubb"), sv: draft("Club", "* one") }, saved, rich),
    ).toBe(false);
  });

  it("ignores a blank tab on either side", () => {
    expect(sameLocaleDrafts({ ...saved, fi: draft(" ") }, saved, rich)).toBe(true);
    expect(sameLocaleDrafts(saved, { ...saved, fr: EMPTY }, rich)).toBe(true);
  });

  it("sees a locale added or removed", () => {
    expect(sameLocaleDrafts({ ...saved, fi: draft("Kerho") }, saved, rich)).toBe(false);
    expect(sameLocaleDrafts({ en: saved.en }, saved, rich)).toBe(false);
  });

  it("sees a changed field", () => {
    expect(sameLocaleDrafts({ ...saved, sv: draft("Klubben") }, saved, rich)).toBe(false);
  });

  it("takes a rich body the editor respelled, untouched, as the saved one", () => {
    const respelled = { ...saved, en: draft("Club", "- one\n\n") };
    expect(sameLocaleDrafts(respelled, saved, rich)).toBe(false);
    const bodies: AuthoredBodies = { serialised: new Map([["* one", "- one\n\n"]]) };
    expect(sameLocaleDrafts(respelled, saved, { fields: ["body"], bodies })).toBe(true);
    // Only the respelling of the saved body counts; a real edit still differs.
    expect(
      sameLocaleDrafts({ ...saved, en: draft("Club", "- one\n- two") }, saved, {
        fields: ["body"],
        bodies,
      }),
    ).toBe(false);
  });

  it("applies the respelling to the rich fields only", () => {
    const bodies: AuthoredBodies = { serialised: new Map([["Klubb", "Klubben"]]) };
    expect(
      sameLocaleDrafts({ ...saved, sv: draft("Klubben") }, saved, { fields: ["body"], bodies }),
    ).toBe(false);
  });

  it("compares plain-text drafts with no body record", () => {
    expect(sameLocaleDrafts({ fi: { a: "Joulu " } }, { fi: { a: "Joulu" } }, NO_RICH_BODIES)).toBe(
      true,
    );
  });

  it("compares drafts whose fields differ from side to side, a missing one as blank", () => {
    const written: Partial<Record<SupportedLocale, Record<string, string>>> = {
      fi: { a: "Joulu" },
    };
    const named = { fi: { a: "Joulu", b: "Pääsiäinen" } };
    expect(sameLocaleDrafts(named, written, NO_RICH_BODIES)).toBe(false);
    expect(sameLocaleDrafts(written, named, NO_RICH_BODIES)).toBe(false);
    expect(sameLocaleDrafts({ fi: { a: "Joulu", b: " " } }, written, NO_RICH_BODIES)).toBe(true);
  });
});
