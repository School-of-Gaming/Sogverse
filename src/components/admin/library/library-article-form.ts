import type { LibraryCategory } from "@/components/library/categories";
import type {
  AdminLibraryArticleListItem,
  LibraryArticleDraft,
  LibraryArticleInput,
} from "@/services/library";

/**
 * The cover the form points at: the catalogue entry's id, which is what a save
 * writes, and its path, which is what the preview paints. They travel together
 * so the frame can never show one entry while the save links another.
 */
export interface LibraryArticleCover {
  id: string;
  path: string;
}

/** The editor's own state: the five fields an admin writes. */
export interface LibraryArticleForm {
  title: string;
  summary: string;
  category: LibraryCategory | null;
  cover: LibraryArticleCover | null;
  /** Authored markdown. */
  body: string;
}

export function emptyLibraryArticleForm(): LibraryArticleForm {
  return { title: "", summary: "", category: null, cover: null, body: "" };
}

/** A saved working copy as the editor opens it. */
export function libraryArticleFormFromDraft(
  draft: LibraryArticleDraft,
): LibraryArticleForm {
  return {
    title: draft.title,
    summary: draft.summary,
    category: draft.category,
    // The database derives the path from the id and nulls it exactly when the
    // id is null, so the two are both present or both absent.
    cover:
      draft.coverImageId === null || draft.coverPath === null
        ? null
        : { id: draft.coverImageId, path: draft.coverPath },
    body: draft.body,
  };
}

/**
 * What a save sends. The service's contract trims and validates it; the whole
 * input travels on every save, because the save assigns every field.
 */
export function libraryArticleInputFromForm(
  form: LibraryArticleForm,
): LibraryArticleInput {
  return {
    title: form.title,
    summary: form.summary,
    body: form.body,
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
 * own serialisation of it. The body is also the saved one when it is that
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
  const body = form.body.trim();
  return (
    form.title.trim() === draft.title.trim() &&
    form.summary.trim() === draft.summary.trim() &&
    (body === draft.body.trim() ||
      body === editorBodies.get(draft.body)?.trim()) &&
    form.category === draft.category &&
    (form.cover?.id ?? null) === draft.coverImageId
  );
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------

/**
 * The fields publishing requires, in the order the form asks for them. The
 * cover is not among them: an article may go live without one.
 */
export const LIBRARY_PUBLISH_FIELDS = [
  "title",
  "summary",
  "category",
  "body",
] as const;

export type LibraryPublishField = (typeof LIBRARY_PUBLISH_FIELDS)[number];

/**
 * What a copy still needs before it can be published, in form order — empty
 * when it is ready. The same rule the publish function applies: a blank after
 * trimming is missing, and so is no category.
 */
export function missingForPublish(
  copy: Pick<LibraryArticleForm, LibraryPublishField>,
): LibraryPublishField[] {
  return LIBRARY_PUBLISH_FIELDS.filter((field) =>
    field === "category" ? copy.category === null : copy[field].trim() === "",
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
 * - `hidden` — a live article with nothing new saved or typed: there is
 *   nothing to publish.
 * - `ready` — the saved copy is complete and differs from what is live, or is
 *   not live at all.
 * - `unsaved` — the form holds changes a save has not stored yet.
 * - `incomplete` — the copy lacks something publishing requires; `missing`
 *   names what.
 *
 * `incomplete` wins over `unsaved`, because the admin has to add the field
 * whether or not they then save, and naming it is the more useful sentence.
 */
export type LibraryPublishState =
  | { kind: "hidden" }
  | { kind: "ready" }
  | { kind: "unsaved" }
  | { kind: "incomplete"; missing: LibraryPublishField[] };

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
  if (isPublished && !hasUnpublishedChanges && !dirty) return { kind: "hidden" };
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
