import { describe, expect, it } from "vitest";
import {
  emptyLibraryArticleForm,
  libraryArticleFormFromDraft,
  libraryArticleInputFromForm,
  libraryArticleStatus,
  libraryPublishState,
  libraryWriteFailure,
  missingForPublish,
  sameAsSaved,
  type LibraryArticleForm,
} from "@/components/admin/library/library-article-form";
import type { LibraryArticleDraft } from "@/services/library";

/**
 * The admin Library editor's rules, apart from any render: where an article
 * stands with readers, what publishing still needs, and whether the form holds
 * anything the save has not stored.
 */

const DRAFT: LibraryArticleDraft = {
  id: "3f0c7a52-3a3e-4a57-9a4e-5a86f2a1c0de",
  title: "Setting up a family gaming agreement",
  summary: "Why a written agreement ends more arguments than it starts.",
  body: "## Why write it down\n\nA rule in one head is a rule to argue with.",
  category: "screen_time",
  coverImageId: "b8805c0f-f47d-4f73-af4a-7a2ae7b30237",
  coverPath: "cover.jpg",
  createdAt: "2026-09-12T11:00:00Z",
  updatedAt: "2026-09-15T08:05:00Z",
};

function complete(): LibraryArticleForm {
  return libraryArticleFormFromDraft(DRAFT);
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
  it("names every missing field, in the order the form asks for them", () => {
    expect(missingForPublish(emptyLibraryArticleForm())).toEqual([
      "title",
      "summary",
      "category",
      "body",
    ]);
  });

  it("counts a field of only whitespace as missing, as the database does", () => {
    expect(
      missingForPublish({ ...complete(), summary: "   ", body: "\n\n" }),
    ).toEqual(["summary", "body"]);
  });

  it("never asks for a cover", () => {
    const noCover: LibraryArticleForm = { ...complete(), cover: null };
    expect(missingForPublish(noCover)).toEqual([]);
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
    ).toEqual({ kind: "hidden" });
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
  it("opens on the saved copy with nothing unsaved", () => {
    expect(sameAsSaved(complete(), DRAFT)).toBe(true);
  });

  it("compares as the save stores, trimmed", () => {
    expect(
      sameAsSaved({ ...complete(), title: `  ${DRAFT.title} ` }, DRAFT),
    ).toBe(true);
  });

  it("sees a changed field, category or cover", () => {
    expect(sameAsSaved({ ...complete(), summary: "Other" }, DRAFT)).toBe(false);
    expect(sameAsSaved({ ...complete(), category: "learning" }, DRAFT)).toBe(
      false,
    );
    expect(sameAsSaved({ ...complete(), cover: null }, DRAFT)).toBe(false);
  });

  it("pairs a cover's id with its path, and has neither for none", () => {
    expect(complete().cover).toEqual({
      id: DRAFT.coverImageId,
      path: DRAFT.coverPath,
    });
    expect(
      libraryArticleFormFromDraft({
        ...DRAFT,
        coverImageId: null,
        coverPath: null,
      }).cover,
    ).toBeNull();
  });

  it("saves every field, the cover as its id", () => {
    expect(libraryArticleInputFromForm(complete())).toEqual({
      title: DRAFT.title,
      summary: DRAFT.summary,
      body: DRAFT.body,
      category: DRAFT.category,
      coverImageId: DRAFT.coverImageId,
    });
    expect(
      libraryArticleInputFromForm({ ...complete(), cover: null }).coverImageId,
    ).toBeNull();
  });
});

describe("a refused write", () => {
  it("quotes the database's own sentence", () => {
    expect(
      libraryWriteFailure({
        code: "23514",
        message: "The article cannot be published without a summary",
      }),
    ).toEqual({
      kind: "reason",
      reason: "The article cannot be published without a summary",
    });
  });

  it("has nothing to quote for anything that is not a wire error", () => {
    expect(libraryWriteFailure(new TypeError("Failed to fetch"))).toEqual({
      kind: "unknown",
    });
    expect(libraryWriteFailure(null)).toEqual({ kind: "unknown" });
    expect(libraryWriteFailure({ code: "23514", message: "" })).toEqual({
      kind: "unknown",
    });
  });
});
