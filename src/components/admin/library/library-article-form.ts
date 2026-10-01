import type { LibraryCategory } from "@/components/library/categories";
import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";
import type {
  AdminLibraryArticleListItem,
  LibraryArticleDraft,
  LibraryArticleInput,
  LibraryArticleVersionInput,
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

const EMPTY_VERSION: LibraryArticleVersionDraft = {
  title: "",
  summary: "",
  body: "",
};

/**
 * The editor's own state: a version per language tab, the open tab, and the
 * article's category and cover. The versions are the team profile form's
 * per-locale map, so switching tabs keeps what was typed in each.
 */
export interface LibraryArticleForm {
  versions: Partial<Record<SupportedLocale, LibraryArticleVersionDraft>>;
  activeLocale: SupportedLocale;
  category: LibraryCategory | null;
  cover: LibraryArticleCover | null;
}

/** The version a tab holds, or an empty one for a tab not yet typed in. */
export function versionOf(
  form: Pick<LibraryArticleForm, "versions">,
  locale: SupportedLocale,
): LibraryArticleVersionDraft {
  return form.versions[locale] ?? EMPTY_VERSION;
}

/** The tabs open, in `SUPPORTED_LOCALES` order. */
export function formLocales(
  form: Pick<LibraryArticleForm, "versions">,
): SupportedLocale[] {
  return SUPPORTED_LOCALES.filter((locale) => form.versions[locale] !== undefined);
}

/** A new article opens on one tab, in the admin's own UI locale. */
export function emptyLibraryArticleForm(
  uiLocale: SupportedLocale,
): LibraryArticleForm {
  return {
    versions: { [uiLocale]: EMPTY_VERSION },
    activeLocale: uiLocale,
    category: null,
    cover: null,
  };
}

function isBlankVersion(version: LibraryArticleVersionDraft): boolean {
  return (
    version.title.trim() === "" &&
    version.summary.trim() === "" &&
    version.body.trim() === ""
  );
}

/** Nothing written into a new article's form yet: leaving it loses nothing. */
export function isBlankLibraryArticleForm(form: LibraryArticleForm): boolean {
  return (
    formLocales(form).every((locale) => isBlankVersion(versionOf(form, locale))) &&
    form.category === null &&
    form.cover === null
  );
}

/** A saved working copy as the editor opens it: on its first version's tab. */
export function libraryArticleFormFromDraft(
  draft: LibraryArticleDraft,
  uiLocale: SupportedLocale,
): LibraryArticleForm {
  const versions: LibraryArticleForm["versions"] = {};
  for (const { locale, title, summary, body } of draft.versions) {
    versions[locale] = { title, summary, body };
  }
  const first = draft.versions.at(0)?.locale;
  if (first === undefined) versions[uiLocale] = EMPTY_VERSION;
  return {
    versions,
    activeLocale: first ?? uiLocale,
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

/**
 * The versions a save would store, trimmed, in locale order. A tab with
 * nothing typed in it is not a version — it is a tab opened and not used — so
 * it is left out, and a new article's first, empty tab is no content.
 */
function versionsToSave(
  form: Pick<LibraryArticleForm, "versions">,
): LibraryArticleVersionInput[] {
  return formLocales(form).flatMap((locale) => {
    const version = versionOf(form, locale);
    if (isBlankVersion(version)) return [];
    return [
      {
        locale,
        title: version.title.trim(),
        summary: version.summary.trim(),
        body: version.body.trim(),
      },
    ];
  });
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
  form: Pick<LibraryArticleForm, "versions">,
): LibrarySaveBlocker | null {
  const versions = versionsToSave(form);
  if (versions.length === 0) return { kind: "noVersion" };
  const untitled = versions.find((version) => version.title === "");
  return untitled === undefined
    ? null
    : { kind: "untitled", locale: untitled.locale };
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
 * Whether the form holds exactly what is saved — compared as the save would
 * store it, trimmed, so a trailing space typed and saved does not leave the
 * form looking unsaved against the trimmed copy the read hands back.
 *
 * `editorBodies` maps a body the rich editor was seeded with to the editor's
 * own serialisation of it. A body is also the saved one when it is that
 * serialisation of the saved body: the editor writes markdown back in its own
 * dialect, and reports it on its first transaction whether or not anything
 * was typed, so an untouched body can arrive spelled differently from the
 * stored one. Only the untouched document serialises to that string, so a
 * real edit still differs from both.
 */
export function sameAsSaved(
  form: LibraryArticleForm,
  draft: LibraryArticleDraft,
  editorBodies: ReadonlyMap<string, string> = new Map(),
): boolean {
  const versions = versionsToSave(form);
  if (versions.length !== draft.versions.length) return false;
  const sameVersions = versions.every((version, index) => {
    const saved = draft.versions[index];
    return (
      version.locale === saved.locale &&
      version.title === saved.title.trim() &&
      version.summary === saved.summary.trim() &&
      (version.body === saved.body.trim() ||
        version.body === editorBodies.get(saved.body)?.trim())
    );
  });
  return (
    sameVersions &&
    form.category === draft.category &&
    (form.cover?.id ?? null) === draft.coverImageId
  );
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

/**
 * The fields a version needs before publishing takes it, in the order the
 * form asks for them.
 */
export const LIBRARY_VERSION_FIELDS = ["title", "summary", "body"] as const;

export type LibraryVersionField = (typeof LIBRARY_VERSION_FIELDS)[number];

/** What a version still needs before publishing takes it; empty when complete. */
export function missingInVersion(
  version: LibraryArticleVersionDraft,
): LibraryVersionField[] {
  return LIBRARY_VERSION_FIELDS.filter((field) => version[field].trim() === "");
}

export function isCompleteVersion(version: LibraryArticleVersionDraft): boolean {
  return missingInVersion(version).length === 0;
}

/**
 * What an article still needs before it can be published: a category, and at
 * least one complete version. A cover is not among them, and neither is a
 * complete version in every language: publishing leaves an incomplete one out.
 */
export type LibraryPublishNeed = "category" | "completeVersion";

export function missingForPublish(
  form: Pick<LibraryArticleForm, "versions" | "category">,
): LibraryPublishNeed[] {
  const needs: LibraryPublishNeed[] = [];
  if (form.category === null) needs.push("category");
  const anyComplete = formLocales(form).some((locale) =>
    isCompleteVersion(versionOf(form, locale)),
  );
  if (!anyComplete) needs.push("completeVersion");
  return needs;
}

/**
 * The languages written but not complete — the ones a publish would leave
 * out — in locale order. A blank tab is not written, so it is not here.
 */
export function incompleteLocales(
  form: Pick<LibraryArticleForm, "versions">,
): SupportedLocale[] {
  return formLocales(form).filter((locale) => {
    const version = versionOf(form, locale);
    return !isBlankVersion(version) && !isCompleteVersion(version);
  });
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

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

/**
 * Why a write was refused: the database's own sentence when it wrote one for
 * a reader, or nothing to quote. The Library's write functions raise their
 * admin-facing sentences under exactly three SQLSTATEs — `check_violation`
 * (a missing title, the publish function's list of what is missing, a cover
 * that is not a Library cover), `no_data_found` (the article is gone) and
 * `foreign_key_violation` (the cover left the catalogue). Every other code
 * carries a message written for a developer, not an admin: supabase-js reports
 * a network fault with an empty code and the fetch error as its message, and an
 * expired session as a `PGRST` code, so those fall back to the generic line.
 */
export type LibraryWriteFailure =
  | { kind: "reason"; reason: string }
  | { kind: "unknown" };

const QUOTED_SQLSTATES: ReadonlySet<string> = new Set([
  "23514", // check_violation
  "P0002", // no_data_found
  "23503", // foreign_key_violation
]);

export function libraryWriteFailure(error: unknown): LibraryWriteFailure {
  if (typeof error !== "object" || error === null) return { kind: "unknown" };
  if (!("code" in error) || !("message" in error)) return { kind: "unknown" };
  const { code, message } = error;
  if (typeof code !== "string" || typeof message !== "string") {
    return { kind: "unknown" };
  }
  if (!QUOTED_SQLSTATES.has(code) || message.length === 0) {
    return { kind: "unknown" };
  }
  return { kind: "reason", reason: message };
}
