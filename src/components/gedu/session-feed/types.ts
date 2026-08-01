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
 */

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
 * A future entry holds **the two written fields only**. Attendance and a
 * ran/didn't-run status are records of what happened and only attach once the
 * session is past; what a gedu can say in advance is what is coming (which
 * families read) and a reminder to themselves. They are the *same two fields* a
 * past entry carries — there is deliberately no planned-versus-recorded
 * distinction in the model or in the copy, because a report written before a
 * session and one written after it are the same field at two moments, and
 * splitting them made every caller decide which one a session sitting on today's
 * date should show.
 *
 * A future entry carries **no voice state**, because no session card anywhere
 * renders a Join affordance: joining is a fact about a *room*, so it lives on
 * the group surfaces (the rail's own-group card, each peer row) and nowhere
 * else. A Join on the timeline made the same room look like a different room
 * from the one in the rail.
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
 * member "absent" is the very different claim that nobody turned up. Attendance
 * is the mandatory part — it doubles as the gedu's confirmation that they ran
 * the session, which is what they are paid on — and both written fields are
 * optional. A past entry with its roster finished *and* a report written is the
 * top of the completeness ladder; with the roster finished and no report it is
 * simply done, and owes nothing.
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
}

/** A session that did not happen — holiday, closure, nobody turned up. */
export interface SkippedSessionFeedEntry extends SessionFeedEntryBase {
  kind: "skipped";
  /** Short free text. `null` renders the generic "no reason given" line. */
  reason: string | null;
}

/**
 * A scheduled occurrence from before write-ups were expected (before the
 * enforcement epoch, or before the product started). Nothing is owed here, so
 * it renders as a quiet placeholder with no alert treatment and no editor.
 */
export interface NoRecordSessionFeedEntry extends SessionFeedEntryBase {
  kind: "no_record";
}

export type SessionFeedEntry =
  | FutureSessionFeedEntry
  | PastSessionFeedEntry
  | SkippedSessionFeedEntry
  | NoRecordSessionFeedEntry;

/** The past kinds whose entry can be expanded into the write-up editor. */
export type EditableSessionFeedEntry =
  | PastSessionFeedEntry
  | SkippedSessionFeedEntry;

/** How one roster member's attendance was recorded. */
export type AttendanceMark = "present" | "absent";

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
 * What the write-up editor emits on save — the same two-way split the past
 * display states have, so a caller maps it straight onto the entry it replaces.
 *
 * The `past` branch carries the marks as they stand, however few of them there
 * are. There is no completeness precondition to encode, because there is no
 * completeness gate: a partial sheet is savable, and the entry it lands on
 * simply keeps saying it needs attention until the last child is marked.
 */
export type SessionRecordDraft =
  | {
      kind: "past";
      attendance: AttendanceMarks;
      report: string;
      staffNote: string;
    }
  | { kind: "skipped"; reason: string };

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

/**
 * The write-up editor's flat working state. Deliberately *not* a union: ticking
 * "this session didn't run" and ticking it back must not throw away a half-typed
 * write-up, so both branches stay alive side by side and only collapse into a
 * `SessionRecordDraft` at save time.
 */
export interface SessionEditorState {
  didNotRun: boolean;
  attendance: AttendanceMarks;
  report: string;
  staffNote: string;
  skipReason: string;
}

/**
 * The future-session editor's working state. Flat and identical in shape to the
 * draft it produces, bar the tag.
 */
export interface SessionPlanEditorState {
  report: string;
  staffNote: string;
}
