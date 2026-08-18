/**
 * Shape of the per-group **session feed** — a reverse-chronological, blog-like
 * scroll of one group's sessions. The next upcoming session sits at the top,
 * every past session runs beneath it, newest first.
 *
 * These are presentation types, deliberately independent of any table: the feed
 * mixes rows that exist (a written-up session) with rows that only exist as an
 * *absence* (a scheduled occurrence nobody has recorded). Whoever feeds the
 * component reconciles the schedule against the stored records and emits one
 * entry per occurrence.
 *
 * **This is the workspace's entry union and nothing else.** A family reads the
 * same sessions through a shape of its own, carrying a report, one child's mark
 * and no way to express a gedu note or another child's attendance; the pieces
 * both shapes are built from live in `@/components/session-feed`.
 */

import type { AttendanceMark } from "@/components/session-feed";

/** One child on the group's roster, as the attendance editor needs them. */
export interface SessionFeedGamer {
  id: string;
  firstName: string;
}

interface SessionFeedEntryBase {
  /**
   * Stable key for the occurrence — not necessarily a stored row id, since gap
   * entries have no row behind them. A `${groupId}:${startInstant}` composite
   * is the natural choice.
   */
  id: string;
  /** Absolute instant the session starts; rendered in the viewer's zone. */
  startsAt: Date;
  /** Absolute instant the session ends; rendered in the viewer's zone. */
  endsAt: Date;
}

/**
 * A session still ahead of us.
 *
 * Every future occurrence inside the feed's horizon is one of these — there is
 * no separate "next session" kind, because "next" is a fact about *position*,
 * not about the session: in a strictly descending feed the next session is
 * simply the last future entry, the one sitting immediately above the most
 * recent past one. Making it a kind of its own would let a caller hand over two
 * next sessions, or a next session below a past one.
 *
 * **"Future" means the session has not *ended* yet, so the one running right
 * now is one of these** — the last of the run, and the current session. The
 * family feed classifies on the same instant; the two are one timeline read by
 * two audiences and must not disagree about which side of the present a session
 * is on.
 *
 * The two written fields are the *same two* a past entry carries. There is
 * deliberately no planned-versus-recorded distinction in the model or the copy,
 * because a report written before a session and one written after it are the
 * same field at two moments, and splitting them made every caller decide which
 * one a session sitting on today's date should show.
 *
 * A future entry carries **no voice state**, because no session card anywhere
 * renders a Join affordance: joining is a fact about a *room*, so it lives on
 * the group surfaces (the rail's own-group card, each peer row) and nowhere
 * else. A Join on the timeline made the same room look like a different room
 * from the one in the rail.
 *
 * It carries no `owed` flag either, and that is not an omission: nothing is
 * owed for a session that has not finished, which is precisely what being on
 * this side of the end instant means.
 */
export interface FutureSessionFeedEntry extends SessionFeedEntryBase {
  kind: "future";
  /**
   * The **session report** families will read, stored as markdown. `null` =
   * unset.
   */
  report: string | null;
  /** The **gedu note** — a reminder for whoever runs it. `null` = unset. */
  staffNote: string | null;
  /**
   * What has been said about each child so far — **present here because a
   * future entry can be the one in progress**, and the register opens at the
   * session's start.
   *
   * On a session that has not begun this is `{}` and cannot be anything else:
   * the server refuses a mark before the start instant, so there is no path
   * that fills it. Read it as "what has been recorded so far", which is
   * honestly nothing until the club opens.
   *
   * This is what lets the running session take the record editor without being
   * misfiled as history — the arrangement that replaced the old start-based
   * kind split, whose only real job was getting that editor onto the card.
   */
  attendance: AttendanceMarks;
  /** Who last touched this session — see the type's own note. */
  lastEditedBy: SessionEditor | null;
}

/**
 * The gedu who last touched a session, as the attribution chip needs them: an
 * id to hash the identicon out of, and a first name.
 *
 * **It is the session's last editor, not the report's author, and the
 * imprecision is accepted rather than overlooked.** The stored row's audit
 * column is stamped by every recorded touch — materializing the row, saving
 * either written field, and each attendance mark or unmark — so a gedu who only
 * corrected a tick is named beside a write-up somebody else typed. In practice
 * the gedu who touches one part of a session touches all of it, and a per-field
 * author column was judged not worth the schema for that edge, which is why the
 * field says *last edited by* rather than *author*. Do not close the gap by
 * quietly adding a report-author column; that is a product decision rather than
 * a refactor.
 *
 * `null` wherever the pair is incomplete: an occurrence with no stored row
 * behind it, a row nothing has stamped, or a stamp whose profile is gone. Both
 * halves are wanted before anybody is named.
 */
export interface SessionEditor {
  /** Real UUID — the identicon is hashed out of its hex bytes. */
  id: string;
  firstName: string;
}

/**
 * A past scheduled occurrence, carrying whatever has been recorded about it.
 *
 * There is deliberately **one** past kind rather than a "written up" one and a
 * separate "nothing here yet" one. The two would be the same row at two moments
 * in its life, and splitting them forces every caller to decide which to emit
 * for a session that has a report but no attendance — a state that genuinely
 * exists and has to render both its report *and* its alert.
 *
 * **Attendance is stored as the sparse per-gamer mark map, not as a list of the
 * present.** A save is allowed at any point — half a roster marked is a real
 * and useful thing to have written down, and refusing it just meant the gedu
 * who got interrupted saved nothing at all. So the record keeps exactly what
 * was said about each child, *including the ones nobody has said anything about
 * yet*: a roster id missing from the map is unmarked, which is a third state a
 * present-list cannot express. That is what lets an entry come back tomorrow
 * still flagged, with the marks already made intact.
 *
 * An empty map is a session nobody has started on; a map marking every roster
 * member "absent" is the very different claim that nobody turned up.
 *
 * **Two of the three fields are owed, and the gedu note is the odd one out.**
 * Attendance doubles as the gedu's confirmation that they ran the session, which
 * is what they are paid on; the report is what the families open their page to
 * read, so an owed session without one has told them nothing. Both have to be
 * there before the entry is finished. The gedu note is a message to a colleague
 * that nobody outside staff ever sees, so it is genuinely optional and is no
 * part of the answer.
 */
export interface PastSessionFeedEntry extends SessionFeedEntryBase {
  kind: "past";
  /**
   * The **session report** — the entry body, later sent to parents and gamers.
   * Stored as markdown; `null` = unset.
   */
  report: string | null;
  /** The **gedu note** — gedu + admin only. `null` renders no block at all. */
  staffNote: string | null;
  /**
   * What has been said about each child so far, keyed by roster id. A roster
   * member with no key here has not been marked; an empty map is a session
   * nobody has recorded anything for.
   */
  attendance: AttendanceMarks;
  /**
   * Whether a write-up is **owed** for this session: dated from the enforcement
   * epoch onward, **and** actually finished.
   *
   * Two boundaries, both of which have to be past for the answer to be yes. A
   * session older than the epoch is work the platform never asked for. A session
   * that has started and not yet ended is work the gedu is in the middle of —
   * they are standing in the room, and nothing is outstanding until the hour is
   * out. The dashboard's SQL count draws the same end line, so the badge and the
   * card can never disagree about which sessions are outstanding.
   *
   * It gates the amber warning and nothing else. Neither an old session nor a
   * live one loses its editor — both are fully recordable, which is what makes
   * roll call during the club work; what they may never do is turn amber for
   * work nobody is owed yet. The green check still applies to both: finish the
   * sheet, write the report, and it is earned.
   */
  owed: boolean;
  /** Who last touched this session — see the type's own note. */
  lastEditedBy: SessionEditor | null;
}

/**
 * A pre-epoch scheduled occurrence with **nothing recorded on it** — a session
 * from before the platform began asking for write-ups.
 *
 * Nothing is owed here, so it renders as a quiet muted placeholder and never
 * alerts. **It is still editable**, and that is the distinction this kind
 * exists to hold: *owed* and *editable* are two different questions, and the
 * epoch answers only the first. A gedu may open any past session back to the
 * product's start and record attendance, a report and a note on it — this one
 * included, through the same record editor every past entry uses. Once anything
 * is recorded, the merge stops emitting it as a gap and it becomes an ordinary
 * past entry whose `owed` flag is false.
 */
export interface NoRecordSessionFeedEntry extends SessionFeedEntryBase {
  kind: "no_record";
}

/**
 * **There is no "skipped" kind**, and its absence is deliberate rather than an
 * omission. A session that did not run — a holiday, a closure, nobody turning
 * up — is a real thing the schema will eventually record, but recording it is
 * inseparable from the cancellation flows that decide *who* may declare a
 * session off and what that does to the family's billing, and none of that is
 * designed yet. A mock that let a gedu tick "didn't run" would be inventing the
 * half of the feature nobody has agreed to, so skip stays a schema intention
 * with no trace anywhere in the UI: no display state, no editor control, no
 * fixture.
 */
export type SessionFeedEntry =
  | FutureSessionFeedEntry
  | PastSessionFeedEntry
  | NoRecordSessionFeedEntry;

/*
 * **There is deliberately no `EditableSessionFeedEntry` type.** There used to
 * be — `past | no_record`, excluding `future` — and it worked only for as long
 * as the kind flipped at the session's *start*, which made "has begun" and "is
 * not future" the same statement.
 *
 * The kind now flips at the **end**, so the session in progress is a `future`
 * entry and is editable: the register opens when the session starts. That makes
 * every kind editable-shaped, and a union of all three is just
 * `SessionFeedEntry` under another name — a type claiming to be a subset while
 * being the whole set, which is worse than no type at all.
 *
 * So editability is a **runtime** question now, asked of the entry and the
 * clock together by `isEditableEntry` in this directory's `entry-state` module.
 * TypeScript cannot express "a future entry that has already started", and
 * pretending otherwise is what the deleted alias was doing.
 */

/**
 * Per-gamer marks, keyed by roster id — both the editor's working state and the
 * shape a past entry stores.
 *
 * A roster id **missing from the map is unmarked** — not absent. That is the
 * three-state distinction a checkbox cannot express, and it survives all the way
 * into storage: a partially-marked sheet saves as itself rather than being
 * padded out with absences nobody claimed.
 *
 * `Partial` is load-bearing rather than decorative: it is what makes a lookup
 * return `AttendanceMark | undefined`, so the compiler keeps every reader
 * handling the unmarked case instead of letting it read as a mark.
 */
export type AttendanceMarks = Readonly<
  Partial<Record<string, AttendanceMark>>
>;

/**
 * What the write-up editor emits on save, mapped straight onto the entry it
 * replaces.
 *
 * It carries the marks as they stand, however few of them there are, and the
 * report as it stands, empty or not. There is no completeness precondition to
 * encode, because there is no completeness gate: a partial sheet is savable and
 * so is a session with nothing written, and the entry it lands on simply keeps
 * saying it needs attention until the last child is marked *and* a report is on
 * it.
 */
export interface SessionRecordDraft {
  kind: "past";
  attendance: AttendanceMarks;
  report: string;
  staffNote: string;
}

/** What the future-session editor emits on save — notes, and nothing else. */
export interface SessionPlanDraft {
  kind: "plan";
  report: string;
  staffNote: string;
}

/**
 * Either editor's output. The two editors are mutually exclusive per entry — a
 * past session can never take a plan, a future one can never take attendance —
 * so one save callback carrying the union keeps the feed's prop surface flat
 * while the kind tag says which side of the present the save came from.
 */
export type SessionEntryDraft = SessionRecordDraft | SessionPlanDraft;

/** The write-up editor's flat working state: the sheet and the two notes. */
export interface SessionEditorState {
  attendance: AttendanceMarks;
  report: string;
  staffNote: string;
}

/**
 * The future-session editor's working state. Flat and identical in shape to the
 * draft it produces, bar the tag.
 */
export interface SessionPlanEditorState {
  report: string;
  staffNote: string;
}
