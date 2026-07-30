/**
 * Pure derivations over the session feed. Everything here is a plain function
 * of its arguments — no React, no clock, no network — so the feed components
 * stay presentational and the same helpers can back an optimistic cache update
 * once the feed is wired to real data.
 */

import type {
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
 * enforcement epoch, so no write-up is owed and offering an editor would invite
 * busywork on sessions we deliberately stopped asking about.
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

/** Whether an entry can be expanded into the **planning** editor. */
export function isPlannableEntry(
  entry: SessionFeedEntry,
): entry is FutureSessionFeedEntry {
  return entry.kind === "future";
}

/**
 * How many entries are the gedu's outstanding work — the alert-badge count.
 *
 * A substitute request is deliberately *not* counted. It is a message to
 * admins and peers, not work the gedu owes anyone, and folding it into the same
 * number would make the badge mean two different things at once.
 */
export function countEntriesNeedingAttention(
  entries: readonly SessionFeedEntry[],
): number {
  return entries.filter((e) => e.kind === "needs_record").length;
}

/** How many of these entries are future sessions asking for a substitute. */
export function countSubstituteRequests(
  entries: readonly SessionFeedEntry[],
): number {
  return entries.filter((e) => e.kind === "future" && e.needsSubstitute).length;
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
    needsSubstitute: entry.needsSubstitute,
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
    needsSubstitute: state.needsSubstitute,
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
    needsSubstitute: draft.needsSubstitute,
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
