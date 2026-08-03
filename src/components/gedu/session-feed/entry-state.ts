/**
 * Pure derivations over the session feed. Everything here is a plain function
 * of its arguments — no React, no clock, no network — so the feed components
 * stay presentational and the same helpers can back an optimistic cache update
 * once the feed is wired to real data.
 */

import type {
  AttendanceMark,
  AttendanceMarks,
  EditableSessionFeedEntry,
  FutureSessionFeedEntry,
  PastSessionFeedEntry,
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
 * **Owed and editable are different questions, and they turn on different
 * things.** Editability turns on the session's *start*: everything that has
 * begun is editable, back to the product's start date, and a session under way
 * is included on purpose — that is the roll-call case. Being owed turns on the
 * epoch and the session's *end*, and lives on the entry's `owed` flag rather
 * than here. Every past session is editable, back to the product's start date:
 * a gedu who wants to record attendance on a session from before the platform
 * started asking is doing something useful, and refusing them an editor to
 * enforce a deadline that was never set is the wrong shape of "no". So a
 * pre-epoch `no_record` gap opens the same editor as last week's session — it
 * simply keeps its muted rendering and never alerts, because *nothing is owed*
 * for it.
 *
 * `future` is the one exclusion, and it has nothing to do with the epoch:
 * attendance is a record of what happened, so a session that has not happened
 * cannot take one. It gets the notes-only editor instead.
 */
export function isEditableEntry(
  entry: SessionFeedEntry,
): entry is EditableSessionFeedEntry {
  return entry.kind === "past" || entry.kind === "no_record";
}

/** Whether an entry can be expanded into the **notes-only** editor. */
export function isPlannableEntry(
  entry: SessionFeedEntry,
): entry is FutureSessionFeedEntry {
  return entry.kind === "future";
}

/**
 * How far up the completeness ladder a past session has got.
 *
 * Three rungs, and only the bottom one is enforced:
 *
 * - `needs_attention` — the session has **finished** and some of the current
 *   roster is still unmarked. This is the one that is *owed*: attendance doubles
 *   as the gedu's confirmation that they ran the session and is what they are
 *   paid on. It cannot appear while a session is still running; the entry is
 *   editable throughout, but nothing is outstanding until the hour is over.
 * - `recorded` — every child has an answer, and no report has been written. A
 *   perfectly finished session as far as the platform is concerned, so it wears
 *   no badge at all rather than a second nag.
 * - `complete` — attendance finished *and* a report written for the families.
 *   The target state, and the only one that gets a mark of its own.
 *
 * The middle rung is why this is a ladder rather than a boolean: a report is
 * genuinely optional, so "not written yet" cannot be an alert, but it also
 * cannot be indistinguishable from the finished article or there is nothing to
 * aim at. Neutral in the middle, green at the top.
 */
export type SessionCompleteness = "needs_attention" | "recorded" | "complete";

/**
 * Where a feed entry sits on the ladder, or `null` for the entries the ladder
 * does not apply to.
 *
 * A **future** session has nothing to be complete about, and a `no_record` gap
 * has nothing recorded on it and nothing owed for it.
 *
 * **An entry that owes nothing never reaches the warning rung.** Its unfinished
 * states land on the neutral middle rung instead. Two sorts of entry are in that
 * position, and the caller has already collapsed both into `owed`: a session
 * from before the enforcement epoch, which the platform never asked for, and a
 * session that has started but not yet **ended**, which the gedu is still in the
 * middle of teaching. The top rung stays reachable for both — somebody who
 * finishes an old session, or marks the room off before the hour is out, earns
 * the check for it.
 *
 * Everything is measured against the *current* roster, never the stored map's
 * keys: a child who joined the group after a session was fully marked reopens
 * it, which is the honest reading, since nobody has yet said whether that child
 * was there.
 */
export function entryCompleteness(
  entry: SessionFeedEntry,
  roster: readonly SessionFeedGamer[],
): SessionCompleteness | null {
  if (entry.kind !== "past") return null;
  if (!attendanceTally(roster, entry.attendance).complete) {
    return entry.owed ? "needs_attention" : "recorded";
  }
  return entry.report !== null && entry.report.length > 0
    ? "complete"
    : "recorded";
}

/**
 * Whether an entry is outstanding work — the alert state, derived rather than
 * stored.
 *
 * It means exactly one thing: **a session that has finished, dated on or after
 * the enforcement epoch, some of whose current roster has not been marked.** The
 * report has no say in it. A past entry can therefore carry a full report and
 * still be flagged, and it renders both — the report as its body, the alert in
 * its header. A session older than the epoch is never flagged however little is
 * recorded on it, which is the whole of what the epoch does — and a session
 * still under way is not flagged either, because the hour it would be nagging
 * about has not run out yet.
 *
 * **A partial save does not discharge it.** Saving is always allowed, so the
 * flag cannot be "has anything been recorded" or half a roster would silence
 * it; it stays up until the last child has an answer, which is precisely what
 * brings the gedu back to finish.
 */
export function entryNeedsAttention(
  entry: SessionFeedEntry,
  roster: readonly SessionFeedGamer[],
): boolean {
  // Reads the ladder rather than re-deriving it, so the epoch exemption above
  // is applied exactly once and the badge can never disagree with the card.
  return entryCompleteness(entry, roster) === "needs_attention";
}

/** Whether an entry has reached the top rung — marked off *and* reported. */
export function entryIsComplete(
  entry: SessionFeedEntry,
  roster: readonly SessionFeedGamer[],
): boolean {
  return entryCompleteness(entry, roster) === "complete";
}

/** How many entries are the gedu's outstanding work — the alert-badge count. */
export function countEntriesNeedingAttention(
  entries: readonly SessionFeedEntry[],
  roster: readonly SessionFeedGamer[],
): number {
  return entries.filter((entry) => entryNeedsAttention(entry, roster)).length;
}

/* ------------------------------------------------------------------ */
/*  Attendance marks                                                   */
/* ------------------------------------------------------------------ */

export interface AttendanceTally {
  /** Roster members marked present. */
  present: number;
  /** Roster members carrying any mark at all, present or absent. */
  marked: number;
  total: number;
  /** Whether every roster member has been marked. */
  complete: boolean;
}

/**
 * The one attendance derivation: how many are present, how far through the
 * roster the marking has got, and whether it is finished.
 *
 * These three questions were three functions and are one because they are one
 * count over one list — every caller that wanted the headline also wanted to
 * know which headline to show, and splitting them meant walking the roster
 * twice to answer a single question.
 *
 * Everything is counted **over the roster**, never over the map's keys. A child
 * who left the group leaves their mark behind in the stored map; counting keys
 * would report "9 of 8 present" on a group of eight and would let a stale key
 * make an unfinished sheet look complete.
 */
export function attendanceTally(
  roster: readonly SessionFeedGamer[],
  attendance: AttendanceMarks,
): AttendanceTally {
  let present = 0;
  let marked = 0;
  for (const gamer of roster) {
    const mark = attendance[gamer.id];
    if (mark === undefined) continue;
    marked += 1;
    if (mark === "present") present += 1;
  }
  return { present, marked, total: roster.length, complete: marked === roster.length };
}

/**
 * Drop marks for anyone no longer on the roster.
 *
 * Applied on the way *into* storage so a saved record describes the group as it
 * is now. Without it a child who left would keep re-entering the record every
 * time an old session was reopened and saved again.
 */
export function rosterScopedMarks(
  roster: readonly SessionFeedGamer[],
  attendance: AttendanceMarks,
): AttendanceMarks {
  const marks: Record<string, AttendanceMark> = {};
  for (const gamer of roster) {
    const mark = attendance[gamer.id];
    if (mark !== undefined) marks[gamer.id] = mark;
  }
  return marks;
}

/* ------------------------------------------------------------------ */
/*  The write-up editor                                                */
/* ------------------------------------------------------------------ */

/**
 * Seed the editor from whatever the entry currently is.
 *
 * A past entry's marks come across exactly as stored, which is what makes the
 * editor resumable: a gedu who marked three children on the night and saved
 * reopens the sheet on those three marks with the other five still unanswered,
 * rather than on a blank sheet or on five invented absences.
 *
 * A pre-epoch gap seeds an empty sheet with empty notes, because that is
 * exactly what it is: an occurrence nobody has ever written anything against.
 * It is the same blank editor a never-touched recent session opens on, which is
 * the point — the epoch changes what is *asked for*, not what the editor is.
 *
 * Nothing is ever pre-ticked, and there is no shortcut anywhere that fills the
 * blanks in. Pre-ticking everyone present — or offering one button that does —
 * would be the convenient thing to do and is exactly what this model exists to
 * stop: a gedu could then save a room they never looked at, and the stored
 * record would claim eight children attended on the strength of one click.
 * Every mark is somebody deciding about one child.
 */
export function editorStateFromEntry(
  entry: EditableSessionFeedEntry,
  roster: readonly SessionFeedGamer[],
): SessionEditorState {
  if (entry.kind === "no_record") {
    return { attendance: {}, report: "", staffNote: "" };
  }
  return {
    attendance: rosterScopedMarks(roster, entry.attendance),
    report: entry.report ?? "",
    staffNote: entry.staffNote ?? "",
  };
}

/**
 * Collapse the editor's working state into the draft it saves as.
 *
 * **It always produces a draft.** It used to refuse an incomplete sheet, and
 * that refusal cost more than it bought: the gedu who was interrupted halfway
 * through a roster saved *nothing*, so the three marks they had made were lost
 * and the next attempt started from zero. Partial marks travel through here
 * unchanged — the sparse map is the stored shape, so there is still no code
 * path that turns "unmarked" into a stored mark, and the entry it lands on goes
 * on flagging itself until the roster is finished.
 */
export function draftFromEditorState(
  state: SessionEditorState,
  roster: readonly SessionFeedGamer[],
): SessionRecordDraft {
  return {
    kind: "past",
    attendance: rosterScopedMarks(roster, state.attendance),
    report: state.report.trim(),
    staffNote: state.staffNote.trim(),
  };
}

/**
 * Replace an entry with what the save turned it into, keeping its identity and
 * schedule. An unrecorded session becomes a recorded one here — which is the
 * whole point of the inline editor: the feed keeps its shape and one row
 * changes state.
 *
 * **A pre-epoch gap saved into becomes an ordinary past entry that owes
 * nothing.** That is the same transition the server-backed merge makes when the
 * row it just wrote comes back: the gap stops being a gap the moment there is
 * something on it, and it carries `owed: false` forward so finishing an old
 * session can never turn it amber.
 *
 * Empty text collapses back to `null` so a cleared note stops rendering its
 * block.
 */
export function applyDraftToEntry(
  entry: EditableSessionFeedEntry,
  draft: SessionRecordDraft,
): PastSessionFeedEntry {
  const { id, startsAt, endsAt } = entry;
  return {
    kind: "past",
    id,
    startsAt,
    endsAt,
    owed: entry.kind === "past" ? entry.owed : false,
    report: draft.report.length > 0 ? draft.report : null,
    staffNote: draft.staffNote.length > 0 ? draft.staffNote : null,
    attendance: draft.attendance,
  };
}

/* ------------------------------------------------------------------ */
/*  Notes on a future session                                          */
/* ------------------------------------------------------------------ */

/** Seed the future-session editor from what that session currently says. */
export function planEditorStateFromEntry(
  entry: FutureSessionFeedEntry,
): SessionPlanEditorState {
  return {
    report: entry.report ?? "",
    staffNote: entry.staffNote ?? "",
  };
}

/** Collapse the future-session editor's working state into its draft. */
export function planDraftFromEditorState(
  state: SessionPlanEditorState,
): SessionPlanDraft {
  return {
    kind: "plan",
    report: state.report.trim(),
    staffNote: state.staffNote.trim(),
  };
}

/**
 * Fold saved notes back into their future entry, keeping identity and schedule.
 * Emptied text collapses to `null` so a cleared note stops rendering its block,
 * exactly as on the past side.
 */
export function applyPlanDraftToEntry(
  entry: FutureSessionFeedEntry,
  draft: SessionPlanDraft,
): FutureSessionFeedEntry {
  return {
    ...entry,
    report: draft.report.length > 0 ? draft.report : null,
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
   * The soonest session still ahead of us — the prominent entry at the head of
   * the feed. `null` once a product's schedule has run out.
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
 * The newest session that actually ran, out of a feed's past run — the one
 * entry whose report the feed renders in full instead of clamping it.
 *
 * **Positional, not a judgement about the writing.** It says nothing about
 * whether anything was recorded on the entry — an unmarked, unwritten week at
 * the head of the past is still the answer. Whatever sits at the top of the past
 * is what the weekly loop opens the page to read: what happened last time, read
 * while prepping the next one or writing this one up. Charging a click for the
 * single report every gedu reads every week is a toll on the only path all of
 * them walk; every older report keeps its clamp, which is what stops a term of
 * write-ups becoming a wall.
 *
 * Pre-epoch gaps are stepped over rather than counted — nothing was ever
 * recorded on them, so there is no report to leave open — and a feed with no
 * past at all answers `null`.
 */
export function newestPastEntryId(
  past: readonly SessionFeedEntry[],
): string | null {
  return past.find((entry) => entry.kind === "past")?.id ?? null;
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
