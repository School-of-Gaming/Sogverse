"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ChevronsDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useNow, useTimezone } from "@/providers";
import { cn } from "@/lib/utils";
import {
  NowDivider,
  editToggleAnchor,
  formatMonthLabel,
  formatSessionLabels,
  newestPastEntryId,
  partitionFeedEntries,
  pastEntryWindow,
  useViewportAnchor,
  withMonthDividers,
  type SessionFeedRow,
} from "@/components/session-feed";
import { SessionFeedItem } from "./SessionFeedItem";
import { entryCompleteness, type SessionCompleteness } from "./entry-state";
import { isPartialSessionSaveError } from "./partial-save";
import type {
  SessionEntryDraft,
  SessionFeedEntry,
  SessionFeedGamer,
} from "./types";

/**
 * The now-divider's React key.
 *
 * Constant, and that is the whole point: the divider moves down the list as the
 * future is revealed above it, and a key that changed with its position would
 * make React replace the element rather than move it — taking the node the
 * scroll correction measures out from under it mid-toggle.
 */
const DIVIDER_KEY = "now-divider";

/** Everything the feed renders as a row, in one keyed list. */
type FeedRow =
  | SessionFeedRow<SessionFeedEntry>
  | { kind: "divider"; key: typeof DIVIDER_KEY };

interface SessionFeedProps {
  /**
   * The group's sessions, newest first: every future occurrence inside the
   * horizon at the head (furthest away first, so the next session is the last
   * of them), then every past occurrence going back in time. The component
   * renders the order it is given — it does no sorting of its own.
   */
  entries: readonly SessionFeedEntry[];
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
  className?: string;
}

/**
 * A group's session feed — the reverse-chronological scroll of what this group
 * has been doing, with the next session on top and the term running backwards
 * beneath it.
 *
 * The spine is a timeline rail with one marker per session, so the run of weeks
 * reads as a single continuous story rather than a stack of unrelated cards,
 * and the markers alone tell you where the gaps are before you read a word.
 *
 * **It is one feed, with one boundary in it.** Everything renders as the same
 * kind of row on the same rail — future sessions included. The only thing
 * separating them from the past is a slim divider carrying the "N upcoming
 * sessions" toggle, and that divider is the sole piece of chrome in the column.
 * The future used to be a dashed container that grew downward inside itself,
 * which quietly taught that a session ahead of you is a different kind of object
 * from a session behind you. It is not: it has the same card, the same states
 * and the same editor.
 *
 * Two things keep a long feed navigable without ever moving painted content:
 *
 * - **The future reveals upward with the viewport pinned.** Date order is never
 *   violated, so expanding inserts sessions *above* the divider — which would
 *   shove the whole page down. Instead the scroll is corrected by exactly the
 *   height that appeared, in the same frame, before the browser paints: the
 *   divider and everything under it stay on the pixel they were on, and the
 *   future is read by scrolling up into it. Nothing animates on that reveal;
 *   animating geometry against a scroll correction is how this pattern breaks.
 * - **The past opens on its recent slice** and older chunks are appended
 *   *below* on request, so that reveal grows away from everything being read.
 * - **Month dividers** mark each boundary the scroll crosses, which is what
 *   turns a year of near-identical weekly dates back into something scannable.
 *   They are computed over the whole visible run, so revealing the future never
 *   produces the same month labelled twice.
 *
 * The same pinning covers **both directions of the editor toggle**, and the two
 * anchor to different rows — see the anchoring module for which and why. Closing
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
 * Which entry is open is the caller's state and persisting is the caller's
 * callback; how much of the feed is revealed, whether a save is in flight, and
 * where focus lands afterwards are this component's own. Nothing here fetches,
 * mutates, or sorts.
 */
export function SessionFeed({
  entries,
  roster,
  sourceTimeZone,
  editingEntryId,
  onEditEntry,
  onSaveEntry,
  className,
}: SessionFeedProps) {
  const t = useTranslations("gedu.sessionFeed");
  const locale = useLocale();
  const timeZone = useTimezone();
  const now = useNow();

  const [laterOpen, setLaterOpen] = useState(false);
  const [chunksRevealed, setChunksRevealed] = useState(0);
  /**
   * The entry whose save is in the air, and why the last one failed.
   *
   * One of each rather than a map, because only one editor can be open at a
   * time — so only one save can ever be in flight and only one error can ever
   * be on screen.
   */
  const [committingEntryId, setCommittingEntryId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const anchor = useViewportAnchor();
  const dividerRef = useRef<HTMLLIElement>(null);
  /** Named so the divider's toggle can say which region it reveals into. */
  const listId = useId();
  /**
   * Every entry's row element, so a save can anchor the card it happened on.
   * A map rather than one ref: which entry is being saved is only known when
   * the click arrives.
   */
  const entryRows = useRef(new Map<string, HTMLLIElement>());
  /** Each entry's Edit button, so focus can be put back where it started. */
  const editButtons = useRef(new Map<string, HTMLButtonElement>());

  const { laterFuture, nextSession, past } = useMemo(
    () => partitionFeedEntries(entries),
    [entries],
  );
  const pastWindow = pastEntryWindow(past.length, chunksRevealed);

  /** The one entry whose report renders in full — see the derivation's own note. */
  const unclampedEntryId = useMemo(() => newestPastEntryId(past), [past]);

  /**
   * One descending run of everything currently on screen — future sessions,
   * month labels, the now-divider and the past — as a single keyed list.
   *
   * Single, for two reasons. A month boundary falling between the last future
   * session and the next one is then labelled once, in the right place, rather
   * than once on each side of the divider. And the divider **keeps its DOM
   * node** across the toggle: it changes index when the future appears above
   * it, and only a stable key inside one array makes React move that node
   * instead of tearing it down and building another. The scroll correction
   * measures that node before and after the state change, so a replaced node
   * would leave it measuring a detached element — every rect zero, and the
   * page thrown to a position nobody asked for.
   */
  const rows = useMemo((): FeedRow[] => {
    const visible: SessionFeedEntry[] = [
      ...(laterOpen ? laterFuture : []),
      ...(nextSession === null ? [] : [nextSession]),
      ...past.slice(0, pastWindow.visible),
    ];
    const dated = withMonthDividers(visible, timeZone);
    if (laterFuture.length === 0 || nextSession === null) return dated;

    // Above the next session, and above the month label introducing it when
    // there is one: a month heading belongs against the entries it names, not
    // cut off from them by a boundary line.
    const at = dated.findIndex(
      (row) => row.kind === "entry" && row.entry.id === nextSession.id,
    );
    if (at < 0) return dated;
    const insertAt = at > 0 && dated[at - 1].kind === "month" ? at - 1 : at;
    return [
      ...dated.slice(0, insertAt),
      { kind: "divider", key: DIVIDER_KEY },
      ...dated.slice(insertAt),
    ];
  }, [laterOpen, laterFuture, nextSession, past, pastWindow.visible, timeZone]);

  if (entries.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        {t("emptyFeed")}
      </p>
    );
  }

  const toggleLater = () => {
    // Captured before the state change, while the divider is still where the
    // reader can see it. No hold: this reveal does not animate, so the geometry
    // is final by the time the correction runs.
    anchor.capture(dividerRef.current);
    setLaterOpen((open) => !open);
  };

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

  const renderRow = (row: FeedRow) => {
    if (row.kind === "divider") {
      return (
        <li key={row.key} ref={dividerRef}>
          <NowDivider
            count={laterFuture.length}
            open={laterOpen}
            controls={listId}
            onToggle={toggleLater}
          />
        </li>
      );
    }

    if (row.kind === "month") {
      return (
        <li key={row.key} className="relative pt-1">
          <span
            aria-hidden
            className="absolute -left-6 top-1/2 h-px w-3 -translate-x-1/2 bg-border"
          />
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {formatMonthLabel(row.startsAt, locale, timeZone)}
          </p>
        </li>
      );
    }

    const { entry } = row;
    const editing = editingEntryId === entry.id;
    const prominent = entry.id === nextSession?.id;
    // Computed once and used twice — the marker on the rail and the card's own
    // badge are the same answer, and it costs a walk of the roster.
    const completeness = entryCompleteness(entry, roster);
    return (
      <li
        key={row.key}
        ref={(node) => {
          if (node === null) entryRows.current.delete(entry.id);
          else entryRows.current.set(entry.id, node);
        }}
        className="relative"
      >
        <span
          aria-hidden
          className={cn(
            "absolute -left-6 h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-4 ring-background",
            entry.kind === "no_record" ? "top-3.5" : "top-5",
            markerTone(entry, completeness, prominent),
          )}
        />
        <SessionFeedItem
          entry={entry}
          roster={roster}
          prominent={prominent}
          completeness={completeness}
          clampReport={entry.id !== unclampedEntryId}
          labels={formatSessionLabels(entry, {
            locale,
            timeZone,
            sourceTimeZone,
            now,
          })}
          editing={editing}
          committing={committingEntryId === entry.id}
          saveError={editing ? saveError : null}
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
      </li>
    );
  };

  return (
    <div
      className={cn("relative space-y-3 border-l border-border pl-6", className)}
    >
      {/* The divider's toggle names this list rather than a wrapper of its own:
          the future entries it reveals are ordinary rows interleaved with month
          labels in one keyed run, and boxing them into a container to point at
          would break the very continuity the single list exists to give. What
          the control changes is what this list holds, and that is what it
          says. */}
      <ol id={listId} className="space-y-3">
        {rows.map(renderRow)}
      </ol>

      {pastWindow.remaining > 0 && (
        // Appends beneath itself, so the button walks down the page with the
        // reveal instead of pushing the story the reader is in.
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={() => setChunksRevealed((c) => c + 1)}
        >
          <ChevronsDown className="h-4 w-4" aria-hidden />
          {t("showEarlier", { count: pastWindow.remaining })}
        </Button>
      )}
    </div>
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
