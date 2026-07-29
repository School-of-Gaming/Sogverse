/**
 * Pure derivations over the session feed. Everything here is a plain function
 * of its arguments — no React, no clock, no network — so the feed components
 * stay presentational and the same helpers can back an optimistic cache update
 * once the feed is wired to real data.
 */

import type {
  EditableSessionFeedEntry,
  SessionEditorState,
  SessionFeedEntry,
  SessionFeedGamer,
  SessionRecordDraft,
} from "./types";

/**
 * Whether an entry can be expanded into the inline editor.
 *
 * `upcoming` can't: it hasn't happened, so there is nothing to record.
 * `no_record` can't either — it sits before the enforcement epoch, so no
 * write-up is owed and offering an editor would invite busywork on sessions
 * we deliberately stopped asking about.
 */
export function isEditableEntry(
  entry: SessionFeedEntry,
): entry is EditableSessionFeedEntry {
  return (
    entry.kind === "recorded" ||
    entry.kind === "skipped" ||
    entry.kind === "needs_record"
  );
}

/** How many entries are the gedu's outstanding work — the alert-badge count. */
export function countEntriesNeedingAttention(
  entries: readonly SessionFeedEntry[],
): number {
  return entries.filter((e) => e.kind === "needs_record").length;
}

/**
 * Attendance headline numbers ("6 of 8 present").
 *
 * `present` is intersected with the roster rather than trusted from the stored
 * list: a child who left the group after a session was recorded is still in the
 * old `presentGamerIds`, and counting them would render "9 of 8 present".
 */
export function attendanceCounts(
  roster: readonly SessionFeedGamer[],
  presentGamerIds: readonly string[],
): { present: number; total: number } {
  const present = new Set(presentGamerIds);
  return {
    present: roster.filter((g) => present.has(g.id)).length,
    total: roster.length,
  };
}

/**
 * Seed the editor from whatever the entry currently is.
 *
 * A never-recorded session opens with **everyone ticked present** — the common
 * case is a full house, so the gedu unticks the one or two who were missing
 * instead of ticking eight boxes every week.
 */
export function editorStateFromEntry(
  entry: EditableSessionFeedEntry,
  roster: readonly SessionFeedGamer[],
): SessionEditorState {
  switch (entry.kind) {
    case "recorded":
      return {
        didNotRun: false,
        presentGamerIds: [...entry.presentGamerIds],
        publicNote: entry.publicNote,
        staffNote: entry.staffNote ?? "",
        skipReason: "",
      };
    case "skipped":
      return {
        didNotRun: true,
        presentGamerIds: roster.map((g) => g.id),
        publicNote: "",
        staffNote: "",
        skipReason: entry.reason ?? "",
      };
    case "needs_record":
      return {
        didNotRun: false,
        presentGamerIds: roster.map((g) => g.id),
        publicNote: "",
        staffNote: "",
        skipReason: "",
      };
  }
}

/** Collapse the editor's flat working state into the branch it saves as. */
export function draftFromEditorState(
  state: SessionEditorState,
): SessionRecordDraft {
  if (state.didNotRun) {
    return { kind: "skipped", reason: state.skipReason.trim() };
  }
  return {
    kind: "recorded",
    presentGamerIds: [...state.presentGamerIds],
    publicNote: state.publicNote.trim(),
    staffNote: state.staffNote.trim(),
  };
}

/**
 * Replace an entry with what the save turned it into, keeping its identity and
 * schedule. A gap becomes a real entry here — which is the whole point of the
 * inline editor: the feed keeps its shape and one row changes state.
 *
 * Empty text collapses back to `null` so a cleared staff note stops rendering
 * its block, and a skip with no typed reason falls back to the generic line.
 */
export function applyDraftToEntry(
  entry: EditableSessionFeedEntry,
  draft: SessionRecordDraft,
): EditableSessionFeedEntry {
  const { id, startsAt, endsAt } = entry;
  if (draft.kind === "skipped") {
    return {
      kind: "skipped",
      id,
      startsAt,
      endsAt,
      reason: draft.reason.length > 0 ? draft.reason : null,
    };
  }
  return {
    kind: "recorded",
    id,
    startsAt,
    endsAt,
    publicNote: draft.publicNote,
    staffNote: draft.staffNote.length > 0 ? draft.staffNote : null,
    presentGamerIds: draft.presentGamerIds,
  };
}
