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
 * A future entry holds **planning** fields only. Attendance and a
 * ran/didn't-run status are records of what happened and only attach once the
 * session is past; what a gedu can say in advance is what they plan to do
 * (which families read later) and a reminder to themselves.
 */
export interface FutureSessionFeedEntry extends SessionFeedEntryBase {
  kind: "future";
  /** Planned note families will read once the session runs. `null` = unset. */
  publicNote: string | null;
  /** Planned gedu-only note — a reminder for whoever runs it. `null` = unset. */
  staffNote: string | null;
  /**
   * Whether the voice window is open right now (drives the Join button).
   * Only ever meaningful on the next session, which is the only future entry
   * that renders a Join affordance.
   */
  voiceIsOpen: boolean;
  /** Where the open Join button navigates. `"#"` keeps it inert. */
  voiceHref: string;
}

/**
 * A past scheduled occurrence, carrying whatever has been recorded about it.
 *
 * There is deliberately **one** past kind rather than a "written up" one and a
 * separate "nothing here yet" one. The two would be the same row at two moments
 * in its life, and splitting them forces every caller to decide which to emit
 * for a session that has a note but no attendance — a state that genuinely
 * exists and has to render both its note *and* its alert.
 *
 * `presentGamerIds` is `null` **until attendance is recorded**, and that null is
 * the whole point of the model: an empty list would mean "everybody was away",
 * which is a real and very different claim from "nobody has said yet". Once
 * recorded, every roster member is explicitly present or absent, so an untouched
 * row can never silently read as an absence. Attendance is the mandatory part —
 * it doubles as the gedu's confirmation that they ran the session, which is what
 * they are paid on — and both notes are optional.
 */
export interface PastSessionFeedEntry extends SessionFeedEntryBase {
  kind: "past";
  /** The entry body — later visible to parents and gamers. `null` = unset. */
  publicNote: string | null;
  /** Gedu + admin only. `null` (or empty) renders no gedu block at all. */
  staffNote: string | null;
  /**
   * Roster ids marked present, with everyone else on the roster explicitly
   * marked absent — or `null` while attendance has not been recorded at all.
   */
  presentGamerIds: readonly string[] | null;
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
 * The editor's per-gamer marks, keyed by roster id.
 *
 * A roster id **missing from the map is unmarked** — not absent. That is the
 * three-state distinction a checkbox cannot express and the reason the editor
 * refuses to save until every roster member has a key here.
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
 * The `past` branch carries a plain `presentGamerIds` array with no null case:
 * the editor only produces a draft once every roster member is marked, so a
 * saved record is unambiguous by construction.
 */
export type SessionRecordDraft =
  | {
      kind: "past";
      presentGamerIds: string[];
      publicNote: string;
      staffNote: string;
    }
  | { kind: "skipped"; reason: string };

/** What the planning editor emits on save, for a future session. */
export interface SessionPlanDraft {
  kind: "plan";
  publicNote: string;
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
  publicNote: string;
  staffNote: string;
  skipReason: string;
}

/**
 * The planning editor's working state. Flat and identical in shape to the draft
 * it produces, bar the tag.
 */
export interface SessionPlanEditorState {
  publicNote: string;
  staffNote: string;
}
