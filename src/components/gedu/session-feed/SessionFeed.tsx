"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronsDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useNow, useTimezone } from "@/providers";
import { cn } from "@/lib/utils";
import { NowDivider } from "./NowDivider";
import { SessionFeedItem } from "./SessionFeedItem";
import {
  entryCompleteness,
  newestRecordedEntryId,
  partitionFeedEntries,
  pastEntryWindow,
} from "./entry-state";
import { withMonthDividers, type SessionFeedRow } from "./feed-rows";
import { useViewportAnchor } from "./scroll-anchor";
import { formatMonthLabel, formatSessionLabels } from "./session-labels";
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
  onSaveEntry: (entryId: string, draft: SessionEntryDraft) => void;
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
 * The same pinning covers **closing an editor**, and it anchors to the card
 * *below* the one being edited. When a gedu saves, their eye is already on the
 * next entry down — the one they are about to write up, or the week before the
 * one they just finished — and that is what has to stay put. Holding the edited
 * card's own top edge instead kept the header still and swept everything under
 * it up the screen, which is the half of the page the reader had moved on to.
 * The consequence is deliberate and worth naming: content *above* the edited
 * card moves instead. That is behind the reader — it is where they have been,
 * not where they are going — and it is the side of the trade that costs least.
 *
 * Which entry is open is the caller's state and saving is the caller's callback;
 * how much of the feed is revealed is this component's own, because it is pure
 * view state that no shell needs to know about. Nothing here fetches, mutates,
 * or sorts.
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

  const anchor = useViewportAnchor();
  const dividerRef = useRef<HTMLLIElement>(null);
  /**
   * Every entry's row element, so a save can anchor the card it happened on.
   * A map rather than one ref: which entry is being saved is only known when
   * the click arrives.
   */
  const entryRows = useRef(new Map<string, HTMLLIElement>());

  const { laterFuture, nextSession, past } = useMemo(
    () => partitionFeedEntries(entries),
    [entries],
  );
  const pastWindow = pastEntryWindow(past.length, chunksRevealed);

  /** The one entry whose report renders in full — see the derivation's own note. */
  const unclampedEntryId = useMemo(() => newestRecordedEntryId(past), [past]);

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
   * Hold the card *below* the edited one still while its editor collapses shut.
   *
   * The card loses most of its height in one frame, and the reader's eye is on
   * what comes next — so the anchor is the edited row's next sibling, not the
   * row itself. Anchoring to the row itself kept its header on the pixel it was
   * on and dragged the entire rest of the feed up past it, which is exactly the
   * content somebody who just saved is moving on to.
   *
   * What this trades away, deliberately: everything *above* the edited card
   * moves down instead. Holding both is impossible — the page lost height in
   * the middle — and the half above the change is the half the reader has
   * already been through.
   *
   * A last row has no sibling and gets no compensation, which is the honest
   * answer: there is nothing below it to hold.
   */
  const anchorBelowEntry = (entryId: string) => {
    const next = entryRows.current.get(entryId)?.nextElementSibling ?? null;
    anchor.capture(next instanceof HTMLElement ? next : null);
  };

  const renderRow = (row: FeedRow) => {
    if (row.kind === "divider") {
      return (
        <li key={row.key} ref={dividerRef}>
          <NowDivider
            count={laterFuture.length}
            open={laterOpen}
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
            markerTone(entry, roster, prominent),
          )}
        />
        <SessionFeedItem
          entry={entry}
          roster={roster}
          prominent={prominent}
          clampReport={entry.id !== unclampedEntryId}
          labels={formatSessionLabels(entry, {
            locale,
            timeZone,
            sourceTimeZone,
            now,
          })}
          editing={editing}
          onToggleEdit={() => {
            if (editing) anchorBelowEntry(entry.id);
            onEditEntry(editing ? null : entry.id);
          }}
          onCancelEdit={() => {
            anchorBelowEntry(entry.id);
            onEditEntry(null);
          }}
          onSave={(draft) => {
            anchorBelowEntry(entry.id);
            onSaveEntry(entry.id, draft);
          }}
        />
      </li>
    );
  };

  return (
    <div
      className={cn("relative space-y-3 border-l border-border pl-6", className)}
    >
      <ol className="space-y-3">{rows.map(renderRow)}</ol>

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
 * The middle rung of the ladder stays the neutral dot it always was. A session
 * marked off but not yet reported on owes nothing, so its marker must not read
 * as a third alert; the green is what the run of grey is measured against.
 */
function markerTone(
  entry: SessionFeedEntry,
  roster: readonly SessionFeedGamer[],
  prominent: boolean,
): string {
  switch (entry.kind) {
    case "future":
      return prominent ? "bg-info" : "bg-info/40";
    case "past":
      switch (entryCompleteness(entry, roster)) {
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
