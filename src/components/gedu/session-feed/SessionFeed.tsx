"use client";

import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTimezone } from "@/providers";
import { cn, formatDate } from "@/lib/utils";
import {
  SessionFeedShell,
  editToggleAnchor,
  formatSessionLabels,
  useViewportAnchor,
  type SessionFeedRowContext,
} from "@/components/session-feed";
import { SessionFeedItem } from "./SessionFeedItem";
import { entryCompleteness, type SessionCompleteness } from "./entry-state";
import { isPartialSessionSaveError } from "./partial-save";
import {
  sessionReportSendFailure,
  type SessionReportSendFailure,
  type SessionReportSendResult,
} from "./send-report";
import type {
  SessionEntryDraft,
  SessionFeedEntry,
  SessionFeedGamer,
} from "./types";

interface SessionFeedProps {
  /**
   * The group's sessions, newest first: every future occurrence inside the
   * horizon at the head (furthest away first, so the next session is the last
   * of them), then every past occurrence going back in time. The component
   * renders the order it is given — it does no sorting of its own.
   */
  entries: readonly SessionFeedEntry[];
  /**
   * The instant the feed reads the clock at — **the same one `entries` were
   * built from**, and required rather than optional so a caller cannot forget.
   *
   * Liveness, which editor each card opens, and the relative dates in the
   * labels all come from this one value. It is a prop instead of a `useNow()`
   * call in here for a reason that is not stylistic: the workspace **freezes**
   * the feed's clock while an editor is open, so that no entry can be
   * reclassified under a gedu who is typing into it. Reading the ticking
   * provider here would walk straight around that freeze — the entries would
   * stay frozen while liveness advanced, and the moment a session's `endsAt`
   * passed, the mounted record editor would be swapped for the notes-only one
   * and the unsaved register would go with it, silently.
   *
   * So the rule is one clock for the entries and their liveness, chosen by
   * whoever owns the feed's state. A caller with nothing to freeze passes its
   * own `useNow()` and loses nothing.
   */
  now: Date;
  /** The group's current roster, for the attendance summary and checklist. */
  roster: readonly SessionFeedGamer[];
  /**
   * The zone the schedule was authored in (products are authored in the club's
   * local zone). Sessions always render in the *viewer's* zone; this is only
   * how the feed knows whether that is a conversion worth flagging.
   */
  sourceTimeZone: string;
  /** Id of the entry expanded into an editor, or `null` when none is. */
  editingEntryId: string | null;
  /** Ask to expand an entry's editor, or `null` to collapse whatever is open. */
  onEditEntry: (entryId: string | null) => void;
  /**
   * Persist one entry's edit. **Awaited**, and that is the whole contract: the
   * feed keeps the editor open and disabled until this settles, closes it only
   * when it resolves, and leaves it open with the gedu's text intact when it
   * rejects. A synchronous handler (a preview scene over local state) resolves
   * immediately and the sequence collapses to what it always was.
   */
  onSaveEntry: (
    entryId: string,
    draft: SessionEntryDraft,
  ) => void | Promise<void>;
  /**
   * Email one session's report to the group's families. **Awaited**, and the
   * contract is the mirror image of the save's: the feed disables the button
   * before this runs and keeps it disabled until the refetched row puts it into
   * its sent state, so the only outcome that hands the button back is a
   * rejection that leaves the session unsent. Resolve with the counts — the
   * card shows them once when some of the mail did not go out — and reject with
   * a `SessionReportSendError` to say which refusal it was. A rejection is not
   * automatically something the gedu is told about: being refused because the
   * report has *already* gone is answered by the sent state, not by a message.
   */
  onSendReport: (entryId: string) => Promise<SessionReportSendResult>;
  className?: string;
}

/**
 * A group's session feed — the reverse-chronological scroll of what this group
 * has been doing, with the next session on top and the term running backwards
 * beneath it.
 *
 * The timeline itself is the **shared feed shell**: the rail, the now-divider
 * and its upward reveal, the month labels, and the history that arrives as the
 * reader scrolls. What lives here is everything that makes this feed a
 * *workspace* rather than a record — the editors, the completeness states, the
 * attendance roster, and the save that has to survive a round trip. The family's
 * read-only feed is the same shell with a different skin, which is what stops
 * the two drifting apart on where "next" is or on what a month boundary looks
 * like.
 *
 * **The editor toggle pins the viewport, in both directions, and the two anchor
 * to different rows** — see the anchoring module for which and why. Closing
 * holds the card *below* the edited one, so the entry a gedu is moving on to
 * stays put; the deliberate cost is that content *above* the edited card moves
 * instead, which is behind the reader rather than ahead of them. Opening holds
 * the clicked row itself, because only one editor is open at a time and opening
 * one silently shuts another — a shut that takes its whole height out from above
 * the button the cursor is still resting on.
 *
 * **The save is awaited here, and the anchor is captured when it lands — not
 * when the button was clicked.** An editor that closed on the click would take
 * its own height out of the page while the write was still in the air, and the
 * scroll correction would then be measuring against a layout that had already
 * settled by the time the row came back. So the editor stays open and disabled
 * for the round trip, the anchor is read in the instant before the close, and a
 * refused write closes nothing at all: the sheet, both notes and the error line
 * stay where the gedu can retry them.
 *
 * **The send is awaited on the same terms, and asymmetrically on purpose.** A
 * save that lands closes its editor here; a send that lands closes nothing,
 * because the thing that ends the in-flight state is the refetched row putting
 * the same button into its sent state. So the in-flight flag is dropped only
 * where the button has to come back — a refusal that left the session unsent —
 * and the counts the send answered with are held beside it as a receipt for
 * that one send: in this component's state for as long as the gedu stays on the
 * page, across the refetch that flips the button, and gone on a reload or a
 * navigation.
 *
 * Which entry is open is the caller's state and persisting is the caller's
 * callback; whether a save is in flight and where focus lands afterwards are
 * this component's own. Nothing here fetches, mutates, or sorts.
 */
export function SessionFeed({
  entries,
  now,
  roster,
  sourceTimeZone,
  editingEntryId,
  onEditEntry,
  onSaveEntry,
  onSendReport,
  className,
}: SessionFeedProps) {
  const t = useTranslations("gedu.sessionFeed");
  const locale = useLocale();
  const timeZone = useTimezone();

  /**
   * The entry whose save is in the air, and why the last one failed.
   *
   * One of each rather than a map, because only one editor can be open at a
   * time — so only one save can ever be in flight and only one error can ever
   * be on screen.
   */
  const [committingEntryId, setCommittingEntryId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * The send in the air, the counts the last one answered with, and why the
   * last one was refused — one of each rather than a map. A card offers its
   * send only while the row is unsent, and the button goes disabled on the
   * click that starts one, so a second send cannot be started anywhere on the
   * feed while one is running.
   *
   * **The in-flight id is cleared only where the button has to come back.** A
   * send that lands is followed by a refetch that flips the button into its
   * sent state, so the disabled control stays disabled straight through rather
   * than being re-enabled — which is exactly the gap this pattern exists to
   * close: there is no frame between the mail going out and the button saying
   * so in which a second send could be started. A refusal that leaves the
   * session unsent is the one case that hands it back.
   *
   * The counts are kept against an entry id so they cannot end up beside the
   * wrong card, and they deliberately live here rather than being cleared by
   * the refetch: the invalidation that follows a send lands almost at once, so
   * anything cleared by it would be gone before it could be read. They are the
   * receipt for one send — they stay for as long as this feed is mounted, and a
   * reload or a navigation is where they stop existing, because nothing stores
   * them.
   */
  const [sendingEntryId, setSendingEntryId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<
    { entryId: string; result: SessionReportSendResult } | null
  >(null);
  const [sendError, setSendError] = useState<
    { entryId: string; message: string } | null
  >(null);

  // This feed's own anchor, for the editor toggle; the shell keeps a separate
  // one for the divider's reveal. Two are safe because a capture is made in a
  // click handler and one click drives one of them — they can never have a
  // pending measurement at the same time.
  const anchor = useViewportAnchor();
  /**
   * Every entry's row element, so a save can anchor the card it happened on.
   * A map rather than one ref: which entry is being saved is only known when
   * the click arrives.
   */
  const entryRows = useRef(new Map<string, HTMLLIElement>());
  /** Each entry's Edit button, so focus can be put back where it started. */
  const editButtons = useRef(new Map<string, HTMLButtonElement>());

  /**
   * What each entry still owes, walked once per data change.
   *
   * Two things read it — the marker on the rail and the card's own badge — and
   * it costs a walk of the roster, so it is resolved here rather than twice per
   * row while rendering.
   */
  const completenessById = useMemo(
    () =>
      new Map<string, SessionCompleteness | null>(
        entries.map((entry) => [entry.id, entryCompleteness(entry, roster)]),
      ),
    [entries, roster],
  );

  if (entries.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {t("emptyFeed")}
      </p>
    );
  }

  /**
   * Capture the anchor for an edit toggle, before the state change that runs it.
   *
   * Which row is held depends on the direction, and that choice lives with the
   * anchoring arithmetic rather than here — this is the DOM half: hand over the
   * live row map and let it pick.
   */
  const anchorEditToggle = (entryId: string, closing: boolean) => {
    anchor.capture(editToggleAnchor(entryRows.current, entryId, closing));
  };

  /**
   * Shut an entry's editor: anchor first (while the old layout is still on
   * screen), then hand focus back to the control that opened it.
   *
   * `preventScroll`, because the card is at that moment losing most of its
   * height under the correction above and a focus-triggered scroll would be one
   * more thing for that correction to undo.
   */
  const closeEditor = (entryId: string) => {
    anchorEditToggle(entryId, true);
    setSaveError(null);
    onEditEntry(null);
    editButtons.current.get(entryId)?.focus({ preventScroll: true });
  };

  /**
   * Persist one entry, holding the editor open across the round trip.
   *
   * `committingEntryId` is set **synchronously, before the caller's mutation
   * is reached**, so there is no render between the click and the disabled
   * state in which Save is clickable a second time. It is cleared only in the
   * same commit as the close (where the region goes `inert` anyway) or on the
   * failure path, which is precisely where the gedu needs the button back.
   */
  const saveEntry = async (entryId: string, draft: SessionEntryDraft) => {
    setSaveError(null);
    setCommittingEntryId(entryId);
    try {
      await onSaveEntry(entryId, draft);
    } catch (error) {
      // The message is ours rather than the thrown error's: a gedu cannot act
      // on a Postgres code. But *which* of ours matters, and it is the one thing
      // the thrown error is allowed to decide. Saving a session is several
      // writes, so it can half-succeed — and telling somebody nothing saved when
      // four of five marks did sends them back to a sheet they now misread. The
      // editor keeps the whole draft either way, and a retry re-sends the lot
      // idempotently.
      setCommittingEntryId(null);
      setSaveError(
        isPartialSessionSaveError(error)
          ? t("savePartiallyFailed")
          : t("saveFailed"),
      );
      return;
    }
    anchorEditToggle(entryId, true);
    setCommittingEntryId(null);
    onEditEntry(null);
    editButtons.current.get(entryId)?.focus({ preventScroll: true });
  };

  /**
   * Email one entry's report, holding its button disabled from the click all
   * the way through to the sent state that follows it.
   *
   * `sendingEntryId` is set **synchronously, before the caller's mutation is
   * reached**, so no render between the click and the disabled button can carry
   * a second one. On success it stays set: the refetch that follows turns the
   * button into its sent state, and clearing the flag first would put a live
   * button back on screen for the frames in between.
   *
   * **Only a refusal that leaves the session unsent hands the button back**,
   * and there are two of those. A send the provider refused outright, and a
   * session whose report has since been deleted, both stop with the button live
   * and a line under it. Being told the report *has already gone* is neither: it
   * says the row is stamped, so what the gedu should be looking at is the sent
   * state the refetch is about to render, and an error line beside it would be
   * arguing with the button. The flag stays set through that one, silently.
   */
  const sendReport = async (entryId: string) => {
    setSendError(null);
    setSendResult(null);
    setSendingEntryId(entryId);
    try {
      const result = await onSendReport(entryId);
      setSendResult({ entryId, result });
    } catch (error) {
      const failure = sessionReportSendFailure(error);
      if (failure === "already_sent") return;
      // Which of the two lines, and only that, is the thrown error's to decide:
      // a report that is no longer there to send is not worth pressing again,
      // and a refused send genuinely might get past on a second press.
      setSendingEntryId(null);
      setSendError({ entryId, message: t(SEND_ERROR_KEY[failure]) });
    }
  };

  /**
   * The rail marker for one row: its tone from what the session still owes, and
   * the quiet size on a placeholder line so the dot sits against its own text
   * rather than against a card that isn't there.
   */
  const markerClass = (
    entry: SessionFeedEntry,
    { prominent }: SessionFeedRowContext,
  ) =>
    cn(
      entry.kind === "no_record" ? "top-3.5" : "top-5",
      markerTone(entry, completenessById.get(entry.id) ?? null, prominent),
    );

  return (
    <SessionFeedShell
      entries={entries}
      className={className}
      registerRow={(entryId, node) => {
        if (node === null) entryRows.current.delete(entryId);
        else entryRows.current.set(entryId, node);
      }}
      markerClass={markerClass}
      renderItem={(entry, { prominent, newestPast }) => {
        const editing = editingEntryId === entry.id;
        return (
          <SessionFeedItem
            entry={entry}
            roster={roster}
            prominent={prominent}
            // The feed's clock, handed to every row so the whole page answers
            // off one instant. It is what puts the record editor on the session
            // the gedu is currently teaching: the kind flips at the session's
            // *end*, so the one in progress is a future entry, and the register
            // opens at its start.
            now={now}
            completeness={completenessById.get(entry.id) ?? null}
            // The newest session that actually ran is the one report a gedu
            // opens the page to read every week; every older one keeps its
            // clamp, which is what stops a term of write-ups becoming a wall.
            clampReport={!newestPast}
            labels={formatSessionLabels(entry, {
              locale,
              timeZone,
              sourceTimeZone,
              now,
            })}
            editing={editing}
            committing={committingEntryId === entry.id}
            saveError={editing ? saveError : null}
            sentAtLabel={
              entry.kind === "past" && entry.reportEmailedAt !== null
                ? // The viewer's zone and locale, like every other clock face
                  // on this feed: the send happened at an instant, and the gedu
                  // reading it may be nowhere near the club's own zone. The
                  // fields are spelled out rather than taken from a date/time
                  // style because a style would give an English reader a
                  // 12-hour clock beside the 24-hour session times two lines
                  // above it.
                  formatDate(entry.reportEmailedAt, locale, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                    timeZone,
                  })
                : null
            }
            sending={sendingEntryId === entry.id}
            sendResult={
              sendResult?.entryId === entry.id ? sendResult.result : null
            }
            sendError={
              sendError?.entryId === entry.id ? sendError.message : null
            }
            onSendReport={() => void sendReport(entry.id)}
            registerEditButton={(node) => {
              if (node === null) editButtons.current.delete(entry.id);
              else editButtons.current.set(entry.id, node);
            }}
            onToggleEdit={() => {
              if (editing) {
                closeEditor(entry.id);
                return;
              }
              anchorEditToggle(entry.id, false);
              setSaveError(null);
              onEditEntry(entry.id);
            }}
            onCancelEdit={() => closeEditor(entry.id)}
            onSave={(draft) => void saveEntry(entry.id, draft)}
          />
        );
      }}
    />
  );
}

/**
 * Timeline marker tone per state. The rail is scanned before anything is read,
 * so the markers carry the same hierarchy the cards do: the next session and the
 * outstanding work stand out, the ordinary weeks are neutral, and the
 * nothing-owed rows all but disappear. A future session is only fully toned when
 * it is the next one — a later date is not a thing to walk into.
 *
 * The loud markers are deliberately on **different hues** rather than different
 * saturations of one: info blue for what is coming, warning amber for what is
 * owed, success green for what is finished end to end. When "next" was
 * primary-toned the rail read as one graded run of warm dots, and the single
 * most useful thing a glance down it can tell you — where the gaps are — was the
 * thing hardest to see.
 *
 * The neutral dot is what is left when a past session says nothing about
 * itself: a pre-epoch week, a session still under way, an unfinished sheet on a
 * group with nobody in it. A session marked off but never written up is **not**
 * one of them any more — the report is owed work now, so that dot is amber like
 * any other gap. The run of grey is what the green and the amber are measured
 * against, and it is the run that shrinks when the standard rises.
 */
function markerTone(
  entry: SessionFeedEntry,
  completeness: SessionCompleteness | null,
  prominent: boolean,
): string {
  switch (entry.kind) {
    case "future":
      return prominent ? "bg-info" : "bg-info/40";
    case "past":
      switch (completeness) {
        case "needs_attention":
          return "bg-warning";
        case "complete":
          return "bg-success";
        default:
          return "bg-muted-foreground/60";
      }
    case "no_record":
      return "bg-muted-foreground/25";
  }
}

/**
 * The line each **spoken** refusal reads as — the two that leave the session
 * unsent and the button live. A total map over exactly those, rather than a
 * chain of ternaries, so a fourth kind of refusal cannot be added without the
 * compiler asking what it says; and the one refusal that says nothing is
 * excluded by name here rather than mapped to copy nothing renders.
 */
const SEND_ERROR_KEY = {
  no_report: "sendReportNoReport",
  failed: "sendReportFailed",
} as const satisfies Record<
  Exclude<SessionReportSendFailure, "already_sent">,
  string
>;
