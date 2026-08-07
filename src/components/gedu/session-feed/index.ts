/**
 * The gedu's **workspace** session feed: the editors, the attendance roster, the
 * derivations that say what a session still owes, the gedu-note block and the
 * badges that count outstanding work.
 *
 * Everything a family surface may also render — the row shaping, the viewer-zone
 * labels, the scroll anchoring, the now-divider and the report body — lives in
 * `@/components/session-feed` and is deliberately **not** re-exported here.
 * Callers import it from there directly, so this barrel stays the answer to one
 * question: what does staff-only look like. A family page reaching for a feed
 * primitive never has a path that could also hand it a gedu note.
 */

export { CollapsibleRegion } from "./CollapsibleRegion";
export { SessionFeed } from "./SessionFeed";
export { SessionFeedAlertBadge } from "./SessionFeedAlertBadge";
export { StaffNoteBlock } from "./StaffNoteBlock";
export {
  applyDraftToEntry,
  applyPlanDraftToEntry,
  attendanceTally,
  countEntriesNeedingAttention,
  draftFromEditorState,
  editorStateFromEntry,
  entryCompleteness,
  entryIsComplete,
  entryNeedsAttention,
  isEditableEntry,
  isLiveEntry,
  isPlannableEntry,
  planDraftFromEditorState,
  planEditorStateFromEntry,
  rosterScopedMarks,
} from "./entry-state";
export type { AttendanceTally, SessionCompleteness } from "./entry-state";
export {
  PartialSessionSaveError,
  isPartialSessionSaveError,
} from "./partial-save";
export type {
  AttendanceMarks,
  FutureSessionFeedEntry,
  NoRecordSessionFeedEntry,
  PastSessionFeedEntry,
  SessionEditorState,
  SessionEntryDraft,
  SessionFeedEntry,
  SessionFeedGamer,
  SessionPlanDraft,
  SessionPlanEditorState,
  SessionRecordDraft,
} from "./types";
