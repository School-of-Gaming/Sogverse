/**
 * Pure derivations over the session feed. Everything here is a plain function
 * of its arguments — no React, no clock, no network — so the feed components
 * stay presentational and the same helpers can back an optimistic cache update
 * once the feed is wired to real data.
 */

import type {
  AttendanceMarks,
  EditableSessionFeedEntry,
  FutureSessionFeedEntry,
  SessionEditorState,
  SessionFeedEntry,
  SessionFeedGamer,
  SessionPlanDraft,
  SessionPlanEditorState,
  SessionRecordDraft,
} from "./types";

/**
 * Whether an entry can be expanded into the **write-up** editor.
 *
 * `future` can't: it hasn't happened, so there is nothing to record — it gets
 * the planning editor instead. `no_record` can't either — it sits before the
 * enforcement epoch, so nothing is owed and offering an editor would invite
 * busywork on sessions we deliberately stopped asking about.
 */
export function isEditableEntry(
  entry: SessionFeedEntry,
): entry is EditableSessionFeedEntry {
  return entry.kind === "past" || entry.kind === "skipped";
}

/** Whether an entry can be expanded into the **planning** editor. */
export function isPlannableEntry(
  entry: SessionFeedEntry,
): entry is FutureSessionFeedEntry {
  return entry.kind === "future";
}

/**
 * Whether an entry is outstanding work — the alert state, derived rather than
 * stored.
 *
 * It means exactly one thing: **a past session, not skipped, whose attendance
 * has not been recorded.** Notes have no say in it. Attendance doubles as the
 * gedu's confirmation that they ran the session and is what they are paid on,
 * so it is the mandatory half; a write-up is a nicety on top. A past entry can
 * therefore carry a full note and still be flagged, and it renders both — the
 * note as its body, the alert in its header.
 */
export function entryNeedsAttention(entry: SessionFeedEntry): boolean {
  return entry.kind === "past" && entry.presentGamerIds === null;
}

/** How many entries are the gedu's outstanding work — the alert-badge count. */
export function countEntriesNeedingAttention(
  entries: readonly SessionFeedEntry[],
): number {
  return entries.filter(entryNeedsAttention).length;
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

/* ------------------------------------------------------------------ */
/*  Attendance marks                                                   */
/* ------------------------------------------------------------------ */

/**
 * Expand a stored present-list into explicit per-gamer marks.
 *
 * Only meaningful for a session whose attendance *was* recorded: at that point
 * every roster member was marked one way or the other, so "not in the present
 * list" is a genuine absence rather than an unanswered question. Reopening the
 * editor therefore shows exactly what was saved.
 */
export function attendanceMarksFromPresentIds(
  roster: readonly SessionFeedGamer[],
  presentGamerIds: readonly string[],
): AttendanceMarks {
  const present = new Set(presentGamerIds);
  return Object.fromEntries(
    roster.map((g) => [g.id, present.has(g.id) ? "present" : "absent"] as const),
  );
}

export interface AttendanceProgress {
  /** How many roster members carry a mark. */
  marked: number;
  total: number;
  /** Whether every roster member has been marked — the gate on saving. */
  complete: boolean;
}

/**
 * How far through the roster the marking has got.
 *
 * Counted **over the roster**, not over the map's keys: a stale key for a child
 * who has since left the group must not make an incomplete sheet look finished.
 */
export function attendanceProgress(
  roster: readonly SessionFeedGamer[],
  attendance: AttendanceMarks,
): AttendanceProgress {
  const marked = roster.filter((g) => attendance[g.id] !== undefined).length;
  return { marked, total: roster.length, complete: marked === roster.length };
}

/* ------------------------------------------------------------------ */
/*  The write-up editor                                                */
/* ------------------------------------------------------------------ */

/**
 * Seed the editor from whatever the entry currently is.
 *
 * A session whose attendance has never been recorded opens with **every row
 * unmarked**, and there is no shortcut anywhere that fills them in. Pre-ticking
 * everyone present — or offering one button that does — would be the convenient
 * thing to do and is exactly what this model exists to stop: a gedu could then
 * save a room they never looked at, and the stored record would claim eight
 * children attended on the strength of one click. Every mark is somebody
 * deciding about one child.
 */
export function editorStateFromEntry(
  entry: EditableSessionFeedEntry,
  roster: readonly SessionFeedGamer[],
): SessionEditorState {
  switch (entry.kind) {
    case "past":
      return {
        didNotRun: false,
        attendance:
          entry.presentGamerIds === null
            ? {}
            : attendanceMarksFromPresentIds(roster, entry.presentGamerIds),
        publicNote: entry.publicNote ?? "",
        staffNote: entry.staffNote ?? "",
        skipReason: "",
      };
    case "skipped":
      return {
        didNotRun: true,
        attendance: {},
        publicNote: "",
        staffNote: "",
        skipReason: entry.reason ?? "",
      };
  }
}

/**
 * Collapse the editor's flat working state into the branch it saves as, or
 * `null` when the sheet is not savable yet.
 *
 * The only way to get `null` is an incomplete attendance sheet on the ran
 * branch, and returning it rather than quietly filling the blanks is the whole
 * guarantee: there is no code path that turns "unmarked" into a stored mark.
 * The editor keeps Save disabled on the same condition, so the null is a
 * belt-and-braces floor rather than something a user can reach.
 */
export function draftFromEditorState(
  state: SessionEditorState,
  roster: readonly SessionFeedGamer[],
): SessionRecordDraft | null {
  if (state.didNotRun) {
    return { kind: "skipped", reason: state.skipReason.trim() };
  }
  if (!attendanceProgress(roster, state.attendance).complete) return null;
  return {
    kind: "past",
    // Roster order, so a saved record reads the same way twice running.
    presentGamerIds: roster
      .filter((g) => state.attendance[g.id] === "present")
      .map((g) => g.id),
    publicNote: state.publicNote.trim(),
    staffNote: state.staffNote.trim(),
  };
}

/**
 * Replace an entry with what the save turned it into, keeping its identity and
 * schedule. An unrecorded session becomes a recorded one here — which is the
 * whole point of the inline editor: the feed keeps its shape and one row
 * changes state.
 *
 * Empty text collapses back to `null` so a cleared note stops rendering its
 * block, and a skip with no typed reason falls back to the generic line.
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
    kind: "past",
    id,
    startsAt,
    endsAt,
    publicNote: draft.publicNote.length > 0 ? draft.publicNote : null,
    staffNote: draft.staffNote.length > 0 ? draft.staffNote : null,
    presentGamerIds: draft.presentGamerIds,
  };
}

/* ------------------------------------------------------------------ */
/*  Planning a future session                                          */
/* ------------------------------------------------------------------ */

/** Seed the planning editor from what the future session currently says. */
export function planEditorStateFromEntry(
  entry: FutureSessionFeedEntry,
): SessionPlanEditorState {
  return {
    publicNote: entry.publicNote ?? "",
    staffNote: entry.staffNote ?? "",
  };
}

/** Collapse the planning editor's working state into the draft it saves as. */
export function planDraftFromEditorState(
  state: SessionPlanEditorState,
): SessionPlanDraft {
  return {
    kind: "plan",
    publicNote: state.publicNote.trim(),
    staffNote: state.staffNote.trim(),
  };
}

/**
 * Fold a saved plan back into its future entry, keeping identity, schedule and
 * voice state. Emptied text collapses to `null` so a cleared note stops
 * rendering its block, exactly as on the past side.
 */
export function applyPlanDraftToEntry(
  entry: FutureSessionFeedEntry,
  draft: SessionPlanDraft,
): FutureSessionFeedEntry {
  return {
    ...entry,
    publicNote: draft.publicNote.length > 0 ? draft.publicNote : null,
    staffNote: draft.staffNote.length > 0 ? draft.staffNote : null,
  };
}

/* ------------------------------------------------------------------ */
/*  Shaping the feed                                                   */
/* ------------------------------------------------------------------ */

export interface FeedPartition {
  /**
   * Future sessions beyond the next one, still in the caller's descending
   * order (furthest away first). These collapse behind one row above the next
   * session, so the feed opens on "what's next and what just happened" rather
   * than on two months of empty calendar.
   */
  laterFuture: FutureSessionFeedEntry[];
  /**
   * The soonest session still ahead of us — the prominent entry that carries
   * the Join affordance. `null` once a product's schedule has run out.
   */
  nextSession: FutureSessionFeedEntry | null;
  /** Everything that has already happened, still descending. */
  past: SessionFeedEntry[];
}

/**
 * Split a descending feed into its three structural parts.
 *
 * The feed is handed to us strictly newest-first, so the future sessions are
 * the leading run and the next session is the *last* of them — the one closest
 * to now, sitting directly above the most recent past entry. Reading "next" off
 * position rather than off a flag is what guarantees the collapsed later-block
 * reads continuously down into the prominent entry beneath it, with global date
 * order never violated.
 *
 * Any future entry appearing *after* a past one would be a caller ordering bug;
 * it stays where it was put (this function does not sort) and simply counts as
 * part of the past block, which keeps the rendered order honest instead of
 * silently reshuffling the story.
 */
export function partitionFeedEntries(
  entries: readonly SessionFeedEntry[],
): FeedPartition {
  // Collected by walking rather than sliced-and-cast, so the narrowing is the
  // loop's own and no assertion has to be trusted.
  const future: FutureSessionFeedEntry[] = [];
  for (const entry of entries) {
    if (!isPlannableEntry(entry)) break;
    future.push(entry);
  }

  return {
    laterFuture: future.slice(0, Math.max(future.length - 1, 0)),
    nextSession: future.length > 0 ? future[future.length - 1] : null,
    past: entries.slice(future.length),
  };
}

/**
 * How many past entries the feed renders before the reader asks for more.
 *
 * A year-old club is 50+ sessions and the newest is always the one being read,
 * so the feed opens on the recent past and everything older waits behind a
 * reveal at the bottom.
 */
export const FEED_INITIAL_PAST_ENTRIES = 10;

/** How many more past entries each "show earlier sessions" click reveals. */
export const FEED_PAST_CHUNK_SIZE = 10;

export interface PastEntryWindow {
  /** How many of the past entries to render, newest first. */
  visible: number;
  /** How many are still hidden — zero means the control renders nothing. */
  remaining: number;
}

/**
 * Which slice of the past is on screen after `chunksRevealed` clicks.
 *
 * Revealing appends *below* what is already painted, so nothing the reader is
 * looking at moves — which is the only reason a chunked reveal is allowed to
 * exist here rather than paginating (paging would swap the whole column out
 * from under them).
 */
export function pastEntryWindow(
  totalPast: number,
  chunksRevealed: number,
): PastEntryWindow {
  const requested =
    FEED_INITIAL_PAST_ENTRIES +
    Math.max(chunksRevealed, 0) * FEED_PAST_CHUNK_SIZE;
  const visible = Math.min(Math.max(totalPast, 0), requested);
  return { visible, remaining: Math.max(totalPast, 0) - visible };
}
