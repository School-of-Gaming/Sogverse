/**
 * Shape of the per-group **session feed** — a reverse-chronological, blog-like
 * scroll of one group's sessions. The next upcoming session sits at the top,
 * every past session runs beneath it, newest first.
 *
 * These are presentation types, deliberately independent of any table: the feed
 * mixes rows that exist (a written-up session) with rows that only exist as an
 * *absence* (a scheduled occurrence nobody wrote up). Whoever feeds the
 * component reconciles the schedule against the stored write-ups and emits one
 * entry per occurrence.
 */

/** One child on the group's roster, as the attendance checklist needs them. */
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
 * The one session still ahead of us. Only ever one, always first in the list —
 * everything below it has already happened.
 */
export interface UpcomingSessionFeedEntry extends SessionFeedEntryBase {
  kind: "upcoming";
  /** Whether the voice window is open right now (drives the Join button). */
  voiceIsOpen: boolean;
  /** Where the open Join button navigates. `"#"` keeps it inert. */
  voiceHref: string;
}

/** A session that ran and has its write-up. The blog post of the feed. */
export interface RecordedSessionFeedEntry extends SessionFeedEntryBase {
  kind: "recorded";
  /** The entry body — later visible to parents and gamers. */
  publicNote: string;
  /** Gedu + admin only. `null` (or empty) renders no staff block at all. */
  staffNote: string | null;
  /** Roster ids marked present. Anything not listed counts as absent. */
  presentGamerIds: readonly string[];
}

/** A session that did not happen — holiday, closure, nobody turned up. */
export interface SkippedSessionFeedEntry extends SessionFeedEntryBase {
  kind: "skipped";
  /** Short free text. `null` renders the generic "no reason given" line. */
  reason: string | null;
}

/**
 * A scheduled occurrence with no write-up, on the enforcement side of the
 * epoch. This is the gedu's work-to-do, rendered inline in the narrative
 * rather than pulled out into a separate queue.
 */
export interface NeedsRecordSessionFeedEntry extends SessionFeedEntryBase {
  kind: "needs_record";
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
  | UpcomingSessionFeedEntry
  | RecordedSessionFeedEntry
  | SkippedSessionFeedEntry
  | NeedsRecordSessionFeedEntry
  | NoRecordSessionFeedEntry;

/** The kinds whose entry can be expanded into the inline editor. */
export type EditableSessionFeedEntry =
  | RecordedSessionFeedEntry
  | SkippedSessionFeedEntry
  | NeedsRecordSessionFeedEntry;

/**
 * What the editor emits on save — the same two-way split the display states
 * have, so a caller maps it straight onto the entry it replaces.
 */
export type SessionRecordDraft =
  | {
      kind: "recorded";
      presentGamerIds: string[];
      publicNote: string;
      staffNote: string;
    }
  | { kind: "skipped"; reason: string };

/**
 * The editor's flat working state. Deliberately *not* a union: ticking "this
 * session didn't run" and ticking it back must not throw away a half-typed
 * write-up, so both branches stay alive side by side and only collapse into a
 * `SessionRecordDraft` at save time.
 */
export interface SessionEditorState {
  didNotRun: boolean;
  presentGamerIds: string[];
  publicNote: string;
  staffNote: string;
  skipReason: string;
}
