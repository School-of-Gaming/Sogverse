import { describe, expect, it } from "vitest";
import {
  emptyLibraryArticleForm,
  incompleteLocales,
  libraryArticleFormFromDraft,
  libraryArticleInputFromForm,
  libraryArticleStatus,
  libraryPublishState,
  librarySaveBlocker,
  libraryWriteFailure,
  missingForPublish,
  sameAsSaved,
  type LibraryArticleForm,
  type LibraryArticleVersionDraft,
} from "@/components/admin/library/library-article-form";
import type { LibraryArticleDraft } from "@/services/library";

/**
 * The admin Library editor's rules, apart from any render: where an article
 * stands with readers, what publishing still needs, and whether the form holds
 * anything the save has not stored.
 */

const DRAFT: LibraryArticleDraft = {
  id: "3f0c7a52-3a3e-4a57-9a4e-5a86f2a1c0de",
  versions: [
    {
      locale: "en",
      title: "Setting up a family gaming agreement",
      summary: "Why a written agreement ends more arguments than it starts.",
      body: "## Why write it down\n\nA rule in one head is a rule to argue with.",
    },
  ],
  category: "screen_time",
  coverImageId: "b8805c0f-f47d-4f73-af4a-7a2ae7b30237",
  coverPath: "cover.jpg",
  coverLabel: "Controller on a desk",
  createdAt: "2026-09-12T11:00:00Z",
  updatedAt: "2026-09-15T08:05:00Z",
};

const EN = DRAFT.versions[0];

function complete(): LibraryArticleForm {
  return libraryArticleFormFromDraft(DRAFT, "fi");
}

/** The form with the English version changed. */
function withEnglish(patch: Partial<LibraryArticleVersionDraft>): LibraryArticleForm {
  const form = complete();
  return { ...form, versions: { ...form.versions, en: { ...EN, ...patch } } };
}

describe("an article's status", () => {
  it("is a draft until it is published, whatever the change flag says", () => {
    expect(
      libraryArticleStatus({ isPublished: false, hasUnpublishedChanges: false }),
    ).toBe("draft");
    expect(
      libraryArticleStatus({ isPublished: false, hasUnpublishedChanges: true }),
    ).toBe("draft");
  });

  it("is published, or published with changes, once live", () => {
    expect(
      libraryArticleStatus({ isPublished: true, hasUnpublishedChanges: false }),
    ).toBe("published");
    expect(
      libraryArticleStatus({ isPublished: true, hasUnpublishedChanges: true }),
    ).toBe("changed");
  });
});

describe("what publishing still needs", () => {
  it("names a category and a complete language for a new article", () => {
    expect(missingForPublish(emptyLibraryArticleForm("en"))).toEqual([
      "category",
      "completeVersion",
    ]);
  });

  it("counts a field of only whitespace as missing, as the database does", () => {
    expect(missingForPublish(withEnglish({ summary: "   " }))).toEqual([
      "completeVersion",
    ]);
  });

  it("needs one complete language, not every language", () => {
    const form = complete();
    const halfFinnish: LibraryArticleForm = {
      ...form,
      versions: { ...form.versions, fi: { title: "Otsikko", summary: "", body: "" } },
    };
    expect(missingForPublish(halfFinnish)).toEqual([]);
    expect(incompleteLocales(halfFinnish)).toEqual(["fi"]);
  });

  it("does not count an untouched tab as a language left out", () => {
    const form = complete();
    expect(
      incompleteLocales({
        ...form,
        versions: { ...form.versions, sv: { title: "", summary: "", body: "" } },
      }),
    ).toEqual([]);
  });

  it("never asks for a cover", () => {
    const noCover: LibraryArticleForm = { ...complete(), cover: null };
    expect(missingForPublish(noCover)).toEqual([]);
  });
});

describe("what a save needs", () => {
  it("needs a language written", () => {
    expect(librarySaveBlocker(emptyLibraryArticleForm("en"))).toEqual({
      kind: "noVersion",
    });
  });

  it("names a language written without its title", () => {
    const form = complete();
    expect(
      librarySaveBlocker({
        ...form,
        versions: { ...form.versions, fi: { title: " ", summary: "Tiivistelmä", body: "" } },
      }),
    ).toEqual({ kind: "untitled", locale: "fi" });
  });

  it("lets a titled draft through", () => {
    expect(librarySaveBlocker(complete())).toBeNull();
  });
});

describe("the Publish control", () => {
  const base = { isPublished: false, hasUnpublishedChanges: false, dirty: false };

  it("is ready for a complete saved draft", () => {
    expect(libraryPublishState({ ...base, form: complete() })).toEqual({
      kind: "ready",
    });
  });

  it("waits for a save while the form holds unsaved changes", () => {
    expect(
      libraryPublishState({ ...base, form: complete(), dirty: true }),
    ).toEqual({ kind: "unsaved" });
  });

  it("names what is missing ahead of asking for a save", () => {
    expect(
      libraryPublishState({
        ...base,
        form: { ...complete(), category: null },
        dirty: true,
      }),
    ).toEqual({ kind: "incomplete", missing: ["category"] });
  });

  it("has nothing to do on a live article that nobody has changed", () => {
    expect(
      libraryPublishState({ ...base, isPublished: true, form: complete() }),
    ).toEqual({ kind: "upToDate" });
  });

  it("publishes changes saved since an article went live", () => {
    expect(
      libraryPublishState({
        ...base,
        isPublished: true,
        hasUnpublishedChanges: true,
        form: complete(),
      }),
    ).toEqual({ kind: "ready" });
  });

  it("comes back on a live article as soon as the form changes", () => {
    expect(
      libraryPublishState({
        ...base,
        isPublished: true,
        dirty: true,
        form: complete(),
      }),
    ).toEqual({ kind: "unsaved" });
  });
});

describe("the form against the saved copy", () => {
  it("opens on the language a reader of the admin's own would be shown, with nothing unsaved", () => {
    // An English-only copy, opened by a Finnish admin, falls back to English.
    expect(complete().activeLocale).toBe("en");
    expect(sameAsSaved(complete(), DRAFT)).toBe(true);
  });

  it("opens on the admin's own language when the copy has it, else English, else the first written", () => {
    const sv = { ...EN, title: "Ett spelavtal" };
    const fi = { ...EN, title: "Pelisopimus" };
    const written = (...versions: LibraryArticleDraft["versions"]) => ({
      ...DRAFT,
      versions,
    });
    expect(
      libraryArticleFormFromDraft(
        written({ ...sv, locale: "sv" }, EN, { ...fi, locale: "fi" }),
        "fi",
      ).activeLocale,
    ).toBe("fi");
    expect(
      libraryArticleFormFromDraft(written({ ...sv, locale: "sv" }, EN), "fi")
        .activeLocale,
    ).toBe("en");
    expect(
      libraryArticleFormFromDraft(written({ ...sv, locale: "sv" }), "fi")
        .activeLocale,
    ).toBe("sv");
  });

  it("opens a new article on the admin's own language", () => {
    expect(emptyLibraryArticleForm("fi").activeLocale).toBe("fi");
  });

  it("compares as the save stores, trimmed", () => {
    expect(sameAsSaved(withEnglish({ title: `  ${EN.title} ` }), DRAFT)).toBe(true);
  });

  it("does not count an opened, untouched tab as a change", () => {
    const form = complete();
    expect(
      sameAsSaved(
        { ...form, versions: { ...form.versions, sv: { title: "", summary: "", body: "" } } },
        DRAFT,
      ),
    ).toBe(true);
  });

  it("sees a language added or removed", () => {
    const form = complete();
    expect(
      sameAsSaved(
        { ...form, versions: { ...form.versions, fi: { title: "Otsikko", summary: "", body: "" } } },
        DRAFT,
      ),
    ).toBe(false);
    expect(sameAsSaved({ ...form, versions: {} }, DRAFT)).toBe(false);
  });

  it("sees a changed field, category or cover", () => {
    expect(sameAsSaved(withEnglish({ summary: "Other" }), DRAFT)).toBe(false);
    expect(sameAsSaved({ ...complete(), category: "learning" }, DRAFT)).toBe(
      false,
    );
    expect(sameAsSaved({ ...complete(), cover: null }, DRAFT)).toBe(false);
  });

  it("pairs a cover's id with its label and path, and has none of them for none", () => {
    expect(complete().cover).toEqual({
      id: DRAFT.coverImageId,
      label: DRAFT.coverLabel,
      path: DRAFT.coverPath,
    });
    expect(
      libraryArticleFormFromDraft(
        { ...DRAFT, coverImageId: null, coverPath: null, coverLabel: null },
        "en",
      ).cover,
    ).toBeNull();
  });

  it("compares the cover by its entry, so a renamed entry is not an unsaved change", () => {
    const form = complete();
    if (form.cover === null) throw new Error("expected a cover");
    expect(
      sameAsSaved({ ...form, cover: { ...form.cover, label: "Renamed" } }, DRAFT),
    ).toBe(true);
  });

  it("saves every field, the cover as its id", () => {
    expect(libraryArticleInputFromForm(complete())).toEqual({
      versions: [EN],
      category: DRAFT.category,
      coverImageId: DRAFT.coverImageId,
    });
    expect(
      libraryArticleInputFromForm({ ...complete(), cover: null }).coverImageId,
    ).toBeNull();
  });
});

describe("a refused write", () => {
  it.each([
    ["23514", "The article cannot be published without a summary"],
    ["P0002", "Library article not found"],
    ["23503", "That picture is no longer in the catalogue"],
  ])("quotes the database's own sentence under %s", (code, message) => {
    expect(libraryWriteFailure({ code, message })).toEqual({
      kind: "reason",
      reason: message,
    });
  });

  it("has nothing to quote for a network fault or an expired session", () => {
    expect(
      libraryWriteFailure({ code: "", message: "TypeError: Failed to fetch" }),
    ).toEqual({ kind: "unknown" });
    expect(
      libraryWriteFailure({ code: "PGRST301", message: "JWT expired" }),
    ).toEqual({ kind: "unknown" });
  });

  it("has nothing to quote for anything that is not a wire error", () => {
    expect(libraryWriteFailure(null)).toEqual({ kind: "unknown" });
    expect(libraryWriteFailure({ code: "23514", message: "" })).toEqual({
      kind: "unknown",
    });
  });
});
