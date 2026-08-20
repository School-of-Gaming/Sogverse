/**
 * Pure derivations over the **gedu's** session feed — what a past session still
 * owes, the attendance counts and both editors' state. Everything here is a plain
 * function of its arguments — no React, no clock, no network — so the feed
 * components stay presentational and the same helpers can back an optimistic
 * cache update once the feed is wired to real data.
 *
 * All of it is workspace-only, which is why it is here rather than in the shared
 * feed module: what is owed, what has been recorded and what may be edited are
 * facts about staff work. The feed's *structural* arithmetic — which entries are
 * ahead of now, which one is next, how much of the past is on screen — is shared
 * with the family's read-only feed and lives in `@/components/session-feed`.
 */

import { hasReport, type AttendanceMark } from "@/components/session-feed";
import type {
  AttendanceMarks,
  FutureSessionFeedEntry,
  SessionEditorState,
  SessionFeedEntry,
  SessionFeedGamer,
  SessionPlanDraft,
  SessionPlanEditorState,
  SessionRecordDraft,
} from "./types";

/**
 * Whether this entry is the session happening **right now** — started, not yet
 * finished.
 *
 * Identical arithmetic to the family feed's live tag, including the exclusive
 * `endsAt` boundary, and deliberately so: the kind flips at the same instant the
 * tag stops being live, so there is no tick in which an entry is live but past,
 * or future but untagged. A conjunction with `kind === "future"` rather than a
 * bare time test, so that the one thing the caller renders and the one thing the
 * builder decided cannot come apart.
 *
 * **This is the primitive the two editor predicates below are built from**, so
 * the module holds one rule about the clock rather than three that have to be
 * kept in step with each other.
 */
export function isLiveEntry(entry: SessionFeedEntry, now: Date): boolean {
  return (
    entry.kind === "future" &&
    entry.startsAt.getTime() <= now.getTime() &&
    now.getTime() < entry.endsAt.getTime()
  );
}

/**
 * **The clock these predicates take must be the one the entries were built
 * from, not a fresher read.**
 *
 * The builder guarantees a `future` entry has not ended — that is what the kind
 * means — and everything below leans on it. Hand them a `now` that has run past
 * an entry's `endsAt` while the entry itself is still the `future` one built at
 * an earlier instant, and the pair is incoherent: the entry says "not over", the
 * clock says otherwise.
 *
 * That is not hypothetical, which is why it is written down here. The workspace
 * deliberately **freezes** the feed's clock while an editor is open, so nothing
 * can be reclassified under somebody who is typing into it. If liveness were
 * then read from a ticking provider instead of from that frozen instant, the
 * open editor would be swapped for the other editor mid-edit and the draft would
 * go with it. One instant in, one coherent set of answers out.
 */

/**
 * Whether an entry can be expanded into the **write-up** editor.
 *
 * **Owed and editable are different questions.** Being owed turns on the epoch
 * and the session's *end*, and lives on the entry's `owed` flag rather than
 * here. Every past session is editable, back to the product's start date: a
 * gedu who wants to record attendance on a session from before the platform
 * started asking is doing something useful, and refusing them an editor to
 * enforce a deadline that was never set is the wrong shape of "no". So a
 * pre-epoch `no_record` gap opens the same editor as last week's session — it
 * simply keeps its muted rendering and never alerts, because *nothing is owed*
 * for it.
 *
 * **A `future` entry can be editable, and that is the roll-call case.** Since
 * the kind flips at the session's *end*, the session happening right now is a
 * future entry — and the register opens at its start, so it takes the record
 * editor exactly as a past entry does. Only a future session that is *not* live
 * is excluded, for a reason the epoch has nothing to do with: attendance is a
 * record of what happened, so a session that has not started cannot take one.
 * It gets the notes-only editor instead.
 *
 * This is why the predicate needs `now` at all. Editability used to be readable
 * off the kind alone, because the kind flipped at the start — the two questions
 * were the same question wearing one flag. They are separate now, and this is
 * the one that asks about the clock.
 *
 * **Phrased as "is live" rather than "has started", and the difference shows up
 * only on an incoherent pair.** Under the invariant above the two are the same
 * test, since a `future` entry has by definition not ended. Building both
 * predicates on {@link isLiveEntry} is what makes this one and
 * {@link isPlannableEntry} exact complements *by construction* rather than by
 * two conditions that happen to line up — so no clock, coherent or not, can
 * produce an entry offering two editors or none.
 */
export function isEditableEntry(entry: SessionFeedEntry, now: Date): boolean {
  return entry.kind !== "future" || isLiveEntry(entry, now);
}

/**
 * Whether an entry can be expanded into the **notes-only** editor: a future
 * session that is not currently running.
 *
 * The exact complement of {@link isEditableEntry} over the same union — the
 * negation of the same expression — so every entry gets one editor and no entry
 * gets both.
 *
 * It still narrows, and soundly: anything it accepts is a future entry. The
 * narrowing is simply *wider* than the runtime test, which additionally requires
 * the session not to be live — a condition no type can carry, since it is a fact
 * about the clock rather than about the shape.
 */
export function isPlannableEntry(
  entry: SessionFeedEntry,
  now: Date,
): entry is FutureSessionFeedEntry {
  return entry.kind === "future" && !isLiveEntry(entry, now);
}

/**
 * What a past session says about itself, or nothing at all.
 *
 * Two states, because two is how many a card can usefully wear:
 *
 * - `needs_attention` — the session is **owed** and one of the things it owes is
 *   missing. Amber, and the count behind every alert badge.
 * - `complete` — every child on the current roster has an answer, a report has
 *   been written for the families, *and* (on an owed session) that report has
 *   been emailed to them. The target state, and the green check.
 *
 * **Every part is owed work, and that is a deliberate reversal.** The report
 * used to be optional: a session marked off with nothing written sat on a silent
 * middle rung, on the argument that a badge there would nag somebody for work
 * they did not owe. The family surfaces settled that argument the other way. The
 * report is what a parent opens their child's page to read — it *is* the
 * product of the session as far as they are concerned — so a session nobody
 * wrote up is a session whose most visible half is missing, and the gedu's own
 * feed has to say so. The register still doubles as the ran-confirmation the
 * gedu is paid on; the report is now the other thing the platform asks for, and
 * neither buys off the other.
 *
 * There is no third value, because the third thing a card can do is say nothing,
 * and `null` already means that.
 */
export type SessionCompleteness = "needs_attention" | "complete";

/**
 * What a feed entry's header shows, or `null` when it shows nothing.
 *
 * Three sorts of entry are silent. A **future** session has nothing to be
 * complete about and a `no_record` gap has nothing on it and nothing owed for
 * it — neither is a past session at all. The third is a past session that is
 * unfinished but **owes nothing**, and the caller has already collapsed two
 * cases into that one flag: a session from before the enforcement epoch, which
 * the platform never asked for, and a session that has started but not yet
 * **ended**, which the gedu is still in the middle of teaching. Both stay
 * neutral however little is on them, and both can still reach `complete` —
 * somebody who goes back and finishes an old session earns the check for it.
 *
 * **A group with nobody in it is never flagged.** There is no register to finish
 * and no family to write to, so an empty roster must not turn into a backlog of
 * one alert per week — the same exemption the dashboard's server-side count
 * applies, and the two have to agree or the badge and the feed behind it tell
 * different stories. It is only the *warning* that is suppressed: a week that
 * was finished while the group still had children in it keeps its check when
 * the last of them leaves, rather than a whole year of history going grey the
 * day a club empties out.
 *
 * Attendance is measured against the *current* roster, never the stored map's
 * keys: a child who joined the group after a session was fully marked reopens
 * it, which is the honest reading, since nobody has yet said whether that child
 * was there.
 *
 * **A pre-session plan discharges the report half, and that is accepted, not
 * enforced away.** The plan editor and the write-up editor deliberately share
 * one field — the plan is the skeleton the write-up grows from — so a session
 * whose text was written *before* it ran reads as reported here and in the
 * dashboard's SQL twin, and that same text is what the family page shows for
 * the session until the gedu revises it. The platform cannot tell a plan from
 * a write-up and does not try: updating the text after the session into what
 * actually happened is the gedu's professional responsibility (owner decision,
 * 2026-08-05). What the machine asks after is the field being non-empty;
 * what fills it honestly is the job.
 *
 * **The third part — the report reaching the families — is asked of owed
 * sessions only, and the asymmetry is deliberate.** This branch has no epoch
 * floor of its own (only the warning below has one), so asking it of everything
 * would strip the green check from every finished session in history and let it
 * be earned back only by mailing a months-old write-up to families. A session
 * the platform never asked for stays finished on the parts it was actually
 * asked for. The dashboard's SQL twin already floors at the epoch, so it needs
 * no equivalent guard and the two still agree.
 *
 * **There is no "nobody to mail" exemption.** A group whose seats carry no
 * contact is still sent to — mailing nobody, and telling staff so — because the
 * send is also what finishes the session: carving it out here would leave such
 * a session flagged for ever with nothing the gedu could do about it, and would
 * force the SQL twin to grow its own notion of mailability to agree.
 */
export function entryCompleteness(
  entry: SessionFeedEntry,
  roster: readonly SessionFeedGamer[],
): SessionCompleteness | null {
  if (entry.kind !== "past") return null;
  const finished =
    attendanceTally(roster, entry.attendance).complete &&
    hasReport(entry.report) &&
    (!entry.owed || entry.reportEmailedAt !== null);
  if (finished) return "complete";
  return entry.owed && roster.length > 0 ? "needs_attention" : null;
}

/**
 * Whether an entry is outstanding work — the alert state, derived rather than
 * stored.
 *
 * It means exactly one thing: **a session that has finished, dated on or after
 * the enforcement epoch, whose register is unfinished, whose report has not
 * been written, or whose report has not been emailed to the families.** Any one
 * gap on its own is enough, so an entry carrying a full report with half a
 * roster unmarked is flagged, so is one marked off to the last child with
 * nothing written for the families, and so is one written up and never sent —
 * a write-up nobody was told about is one nobody reads. A session older than the
 * epoch is never flagged however little is on it, which is the whole of what the
 * epoch does — and a session still under way is not flagged either, because the
 * hour it would be nagging about has not run out yet.
 *
 * **A partial save does not discharge it.** Saving is always allowed, so the
 * flag cannot be "has anything been recorded" or half a roster would silence
 * it; it stays up until the last child has an answer and the write-up is in,
 * which is precisely what brings the gedu back to finish.
 */
export function entryNeedsAttention(
  entry: SessionFeedEntry,
  roster: readonly SessionFeedGamer[],
): boolean {
  // Reads the state rather than re-deriving it, so the epoch and empty-roster
  // exemptions above are applied exactly once and the badge can never disagree
  // with the card.
  return entryCompleteness(entry, roster) === "needs_attention";
}

/**
 * Whether an entry has reached the target state — marked off, reported, and
 * (where it was owed) the report sent to the families.
 */
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
  entry: SessionFeedEntry,
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
 * **A live entry stays future, and that is load-bearing.** Taking the register
 * during a session must not move the card: flipping it to `past` would drop it
 * below the divider, swap its Live tag for a completeness state and reorder the
 * feed under a gedu who is mid-roll-call — a save doing all that at 14:30 of a
 * session running to 23:00, on the surface they are actively working in. The
 * session is still running, so the entry is still `future`; only its contents
 * changed. The clock moves it when the clock is ready, on the tick that passes
 * its end instant.
 *
 * Empty text collapses back to `null` so a cleared note stops rendering its
 * block.
 *
 * **The last editor is carried through rather than rewritten**, because this
 * function does not know who is saving and must not guess. The stamp is the
 * database's — every recorded touch writes it server-side — so the authoritative
 * answer arrives with the refetched row; folding a draft in locally is about the
 * entry's *contents*, and inventing an editor here would put a name on the card
 * that the next read could contradict. A gap saved into therefore stays unsigned
 * until the row comes back, which is the honest state: nothing is stored yet.
 */
export function applyDraftToEntry(
  entry: SessionFeedEntry,
  draft: SessionRecordDraft,
): SessionFeedEntry {
  const { id, startsAt, endsAt } = entry;
  const written = {
    report: draft.report.length > 0 ? draft.report : null,
    staffNote: draft.staffNote.length > 0 ? draft.staffNote : null,
    attendance: draft.attendance,
    lastEditedBy: entry.kind === "no_record" ? null : entry.lastEditedBy,
  };

  if (entry.kind === "future") {
    return { kind: "future", id, startsAt, endsAt, ...written };
  }

  return {
    kind: "past",
    id,
    startsAt,
    endsAt,
    owed: entry.kind === "past" ? entry.owed : false,
    // Carried through untouched, for the same reason the last editor is: the
    // stamp belongs to the database. Saving a report cannot have emailed it,
    // and a gap saved into has never been emailed at all — so folding a draft
    // in locally must not invent, or drop, the one fact that decides whether
    // the card offers a Send button or a sent line.
    reportEmailedAt: entry.kind === "past" ? entry.reportEmailedAt : null,
    ...written,
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
