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
 *
 * The two audience blocks both live here for that reason, and it is not a
 * contradiction: neither is a thing a family renders. They are the banners a
 * *gedu's editor* wears to say which of the two fields under it families will
 * end up reading, and they are only legible as a pair.
 */

export { CollapsibleRegion } from "./CollapsibleRegion";
export { FamilyNoteBlock } from "./FamilyNoteBlock";
export { SessionFeed } from "./SessionFeed";
export { SessionFeedAlertBadge } from "./SessionFeedAlertBadge";
export { SessionPhotoStrip } from "./SessionPhotoStrip";
export { StaffNoteBlock } from "./StaffNoteBlock";
export { sessionPhotoErrorCode } from "./photo-failure";
export {
  NO_LANDED_PHOTOS,
  NO_STAGED_PHOTOS,
  keptPhotos,
  stagedPhotoCount,
} from "./staged-photos";
export type {
  LandedSessionPhotos,
  SessionPhotoEditing,
  StagedSessionPhoto,
  StagedSessionPhotos,
} from "./staged-photos";
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
  entryOwesCreations,
  isEditableEntry,
  isLiveEntry,
  isPlannableEntry,
  planDraftFromEditorState,
  planEditorStateFromEntry,
  rosterScopedMarks,
} from "./entry-state";
export type {
  AttendanceTally,
  CreationsObligation,
  SessionCompleteness,
} from "./entry-state";
export {
  PartialSessionSaveError,
  isPartialSessionSaveError,
} from "./partial-save";
export {
  SessionReportSendError,
  sessionReportSendFailure,
} from "./send-report";
export type {
  SessionReportSendFailure,
  SessionReportSendResult,
} from "./send-report";
export type {
  AttendanceMarks,
  FutureSessionFeedEntry,
  NoRecordSessionFeedEntry,
  PastSessionFeedEntry,
  SessionEditor,
  SessionEditorState,
  SessionEntryDraft,
  SessionFeedEntry,
  SessionFeedGamer,
  SessionPlanDraft,
  SessionPlanEditorState,
  SessionRecordDraft,
} from "./types";
