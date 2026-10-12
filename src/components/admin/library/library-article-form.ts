import type { LibraryCategory } from "@/components/library/categories";
import type { AuthoredBodies } from "@/lib/authored-bodies";
import type { SupportedLocale } from "@/lib/constants/locales";
import {
  checkLocaleDrafts,
  draftsToSave,
  newLocaleTabs,
  openLocaleTabs,
  sameLocaleDrafts,
  type LocaleTabState,
} from "@/lib/i18n/locale-tabs";
import {
  isCompleteVersion,
  type AdminLibraryArticleListItem,
  type LibraryArticleDraft,
  type LibraryArticleInput,
  type LibraryArticleVersionInput,
} from "@/services/library";

/**
 * The cover the form points at: the catalogue entry's id, which is what a save
 * writes, and its label and path, which the picker shows. They travel together
 * so the frame can never show one entry while the save links another.
 */
export interface LibraryArticleCover {
  id: string;
  label: string;
  path: string;
}

/** One language's text as typed — untrimmed, so nothing moves under the cursor. */
export interface LibraryArticleVersionDraft {
  title: string;
  summary: string;
  /** Authored markdown. */
  body: string;
}

export const EMPTY_VERSION: LibraryArticleVersionDraft = {
  title: "",
  summary: "",
  body: "",
};

/**
 * The editor's own state: the language tabs, a version in each, and the
 * article's category and cover. The tabs are the shared per-locale tab set
 * (`@/lib/i18n/locale-tabs`), so switching tabs keeps what was typed in each.
 */
export interface LibraryArticleForm {
  tabs: LocaleTabState<LibraryArticleVersionDraft>;
  category: LibraryCategory | null;
  cover: LibraryArticleCover | null;
}

/** A new article opens on one tab, in the admin's own UI locale. */
export function emptyLibraryArticleForm(
  uiLocale: SupportedLocale,
): LibraryArticleForm {
  return {
    tabs: newLocaleTabs(uiLocale, EMPTY_VERSION),
    category: null,
    cover: null,
  };
}

/** Nothing written into a new article's form yet: leaving it loses nothing. */
export function isBlankLibraryArticleForm(form: LibraryArticleForm): boolean {
  return (
    draftsToSave(form.tabs.drafts).length === 0 &&
    form.category === null &&
    form.cover === null
  );
}

/** The saved copy's versions, one per locale. */
function savedVersions(
  draft: LibraryArticleDraft,
): LocaleTabState<LibraryArticleVersionDraft>["drafts"] {
  const versions: LocaleTabState<LibraryArticleVersionDraft>["drafts"] = {};
  for (const { locale, title, summary, body } of draft.versions) {
    versions[locale] = { title, summary, body };
  }
  return versions;
}

/**
 * A saved working copy as the editor opens it: on the tab a reader of the
 * admin's UI locale would be shown (`openingLocaleTab`).
 */
export function libraryArticleFormFromDraft(
  draft: LibraryArticleDraft,
  uiLocale: SupportedLocale,
): LibraryArticleForm {
  return {
    tabs: openLocaleTabs(savedVersions(draft), uiLocale, EMPTY_VERSION),
    category: draft.category,
    // The database derives the path from the id and the read embeds the label
    // through it, so all three are present or all absent.
    cover:
      draft.coverImageId === null ||
      draft.coverPath === null ||
      draft.coverLabel === null
        ? null
        : {
            id: draft.coverImageId,
            label: draft.coverLabel,
            path: draft.coverPath,
          },
  };
}

/** The versions a save would store, trimmed, in locale order; blank tabs are left out. */
function versionsToSave(
  form: Pick<LibraryArticleForm, "tabs">,
): LibraryArticleVersionInput[] {
  return draftsToSave(form.tabs.drafts).map(({ locale, draft }) => ({
    locale,
    title: draft.title.trim(),
    summary: draft.summary.trim(),
    body: draft.body.trim(),
  }));
}

/**
 * Why a save cannot go ahead, before it is tried: no language written at all,
 * or a language written without its title (the admin list names an article by
 * one). The same rule the save function applies.
 */
export type LibrarySaveBlocker =
  | { kind: "noVersion" }
  | { kind: "untitled"; locale: SupportedLocale };

export function librarySaveBlocker(
  form: Pick<LibraryArticleForm, "tabs">,
): LibrarySaveBlocker | null {
  const problem = checkLocaleDrafts(
    form.tabs.drafts,
    (version) => version.title.trim() !== "",
  );
  if (problem === null) return null;
  return problem.kind === "none"
    ? { kind: "noVersion" }
    : { kind: "untitled", locale: problem.locale };
}

/**
 * What a save sends. The service's contract validates it; the whole input
 * travels on every save, because the save assigns every field and replaces
 * the whole version set.
 */
export function libraryArticleInputFromForm(
  form: LibraryArticleForm,
): LibraryArticleInput {
  return {
    versions: versionsToSave(form),
    category: form.category,
    coverImageId: form.cover?.id ?? null,
  };
}

/**
 * Whether the form holds exactly what is saved: the versions as the shared
 * per-locale comparison judges them — trimmed, blank tabs ignored, and a body
 * also unchanged when it is the rich editor's own respelling of the saved one
 * (`bodies`) — and the same category and cover entry.
 */
export function sameAsSaved(
  form: LibraryArticleForm,
  draft: LibraryArticleDraft,
  bodies: AuthoredBodies,
): boolean {
  return (
    sameLocaleDrafts(form.tabs.drafts, savedVersions(draft), {
      fields: ["body"],
      bodies,
    }) &&
    form.category === draft.category &&
    (form.cover?.id ?? null) === draft.coverImageId
  );
}


// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

/**
 * What an article still needs before it can be published: a category, and at
 * least one complete version. A cover is not among them, and neither is a
 * complete version in every language: publishing leaves an incomplete one out.
 */
export type LibraryPublishNeed = "category" | "completeVersion";

export function missingForPublish(
  form: Pick<LibraryArticleForm, "tabs" | "category">,
): LibraryPublishNeed[] {
  const needs: LibraryPublishNeed[] = [];
  if (form.category === null) needs.push("category");
  const anyComplete = draftsToSave(form.tabs.drafts).some(({ draft }) =>
    isCompleteVersion(draft),
  );
  if (!anyComplete) needs.push("completeVersion");
  return needs;
}

/**
 * The languages written but not complete — the ones a publish would leave
 * out — in locale order. A blank tab is not written, so it is not here.
 */
export function incompleteLocales(
  form: Pick<LibraryArticleForm, "tabs">,
): SupportedLocale[] {
  return draftsToSave(form.tabs.drafts).flatMap(({ locale, draft }) =>
    isCompleteVersion(draft) ? [] : [locale],
  );
}

/**
 * Where an article stands with readers, as one word:
 *
 * - `draft` — not in the Library.
 * - `published` — in the Library, exactly as saved.
 * - `changed` — in the Library, with saved changes readers do not see yet.
 */
export type LibraryArticleStatus = "draft" | "published" | "changed";

export function libraryArticleStatus(
  article: Pick<
    AdminLibraryArticleListItem,
    "isPublished" | "hasUnpublishedChanges"
  >,
): LibraryArticleStatus {
  if (!article.isPublished) return "draft";
  return article.hasUnpublishedChanges ? "changed" : "published";
}

/**
 * What the Publish control does with the form as it stands.
 *
 * Publishing copies the **saved** working copy, so the control acts only on a
 * form with nothing unsaved in it: a Publish that published something other
 * than what is on screen would be worse than one that asks for a save first.
 *
 * - `upToDate` — a live article with nothing new saved or typed: there is
 *   nothing to publish.
 * - `ready` — the saved copy is complete and differs from what is live, or is
 *   not live at all.
 * - `unsaved` — the form holds changes a save has not stored yet.
 * - `incomplete` — the article lacks something publishing requires; `missing`
 *   names what.
 *
 * `incomplete` wins over `unsaved`, because the admin has to add the field
 * whether or not they then save, and naming it is the more useful sentence.
 */
export type LibraryPublishState =
  | { kind: "upToDate" }
  | { kind: "ready" }
  | { kind: "unsaved" }
  | { kind: "incomplete"; missing: LibraryPublishNeed[] };

export function libraryPublishState({
  form,
  dirty,
  isPublished,
  hasUnpublishedChanges,
}: {
  form: LibraryArticleForm;
  /** The form differs from the saved working copy. */
  dirty: boolean;
  isPublished: boolean;
  hasUnpublishedChanges: boolean;
}): LibraryPublishState {
  if (isPublished && !hasUnpublishedChanges && !dirty) {
    return { kind: "upToDate" };
  }
  // While nothing is unsaved the form *is* the saved copy, so reading the
  // form answers for the copy publishing would take.
  const missing = missingForPublish(form);
  if (missing.length > 0) return { kind: "incomplete", missing };
  if (dirty) return { kind: "unsaved" };
  return { kind: "ready" };
}
