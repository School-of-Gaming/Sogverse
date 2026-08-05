"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { useTimezone } from "@/providers";
import { NowDivider } from "./NowDivider";
import { withMonthDividers, type SessionFeedRow } from "./feed-rows";
import {
  newestPastEntryId,
  partitionFeedEntries,
  pastEntryWindow,
} from "./feed-shape";
import { useViewportAnchor } from "./scroll-anchor";
import { formatMonthLabel } from "./session-labels";

/**
 * The now-divider's React key.
 *
 * Constant, and that is the whole point: the divider moves down the list as the
 * future is revealed above it, and a key that changed with its position would
 * make React replace the element rather than move it — taking the node the
 * scroll correction measures out from under it mid-toggle.
 */
const DIVIDER_KEY = "now-divider";

/**
 * How far below the viewport the sentinel counts as reached.
 *
 * Roughly a screen of feed, so the next chunk is already in the document by the
 * time the reader's eye gets to where it lands: a reveal triggered exactly at
 * the bottom edge is a reveal the reader watches happen. It is deliberately
 * generous rather than tuned — the entries are already in memory, so revealing
 * a chunk early costs a few dozen rows of render and nothing else.
 */
const SENTINEL_ROOT_MARGIN = "800px 0px";

/** Everything a feed renders as a row, in one keyed list. */
type ShellRow<T extends FeedShellEntry> =
  | SessionFeedRow<T>
  | { kind: "divider"; key: typeof DIVIDER_KEY };

/** The minimum an entry has to be for the shell to place it on the rail. */
interface FeedShellEntry {
  id: string;
  kind: string;
  startsAt: Date;
}

/**
 * What the shell has worked out about one entry, handed to whoever is drawing
 * it. Both facts are positional — they come out of the same walk that decides
 * where the divider goes — so a surface that re-derived either would be running
 * the partition a second time to reach a different answer.
 */
export interface SessionFeedRowContext {
  /**
   * Whether this is the soonest session still ahead — the one prominent entry
   * at the head of the feed.
   */
  prominent: boolean;
  /**
   * Whether this is the newest entry that actually ran. It is the one report a
   * feed may choose to render unclamped; a feed that clamps nothing ignores it.
   */
  newestPast: boolean;
}

interface SessionFeedShellProps<T extends FeedShellEntry> {
  /**
   * The feed's entries, newest first: every future occurrence inside the
   * horizon at the head (furthest away first, so the next session is the last
   * of them), then every past occurrence going back in time. The shell renders
   * the order it is given — it does no sorting of its own.
   */
  entries: readonly T[];
  /**
   * The rail marker's tone and vertical offset for one entry, as Tailwind
   * classes appended to the marker's own geometry. What the markers *say* is
   * the one part of this rail that differs by surface — a gedu's encode what a
   * session still owes, a family's deliberately encode nothing — so the shell
   * owns the dot and the caller owns its colour.
   */
  markerClass: (entry: T, context: SessionFeedRowContext) => string;
  /** The card (or quiet line) for one entry. */
  renderItem: (entry: T, context: SessionFeedRowContext) => ReactNode;
  /**
   * Hand back each entry's row element as it mounts, `null` as it unmounts.
   *
   * Only a feed with editors in it needs this: closing one anchors the row
   * *below* the edited entry, and which row that is only becomes known when the
   * click arrives. A read-only feed passes nothing and the shell keeps no map.
   */
  registerRow?: (entryId: string, node: HTMLLIElement | null) => void;
  className?: string;
}

/**
 * The shape every session feed is: a timeline rail with one marker per session,
 * the future collapsed behind a divider at the top, month labels down the run,
 * and the past arriving as the reader scrolls into it.
 *
 * **It is one feed, with one boundary in it.** Everything renders as the same
 * kind of row on the same rail — future sessions included. The only thing
 * separating them from the past is a slim divider carrying the "N upcoming
 * sessions" toggle, and that divider is the sole piece of chrome in the column.
 * The future used to be a dashed container that grew downward inside itself,
 * which quietly taught that a session ahead of you is a different kind of object
 * from a session behind you. It is not.
 *
 * Three things keep a long feed navigable without ever moving painted content:
 *
 * - **The future reveals upward with the viewport pinned.** Date order is never
 *   violated, so expanding inserts sessions *above* the divider — which would
 *   shove the whole page down. Instead the scroll is corrected by exactly the
 *   height that appeared, in the same frame, before the browser paints: the
 *   divider and everything under it stay on the pixel they were on, and the
 *   future is read by scrolling up into it. Nothing animates on that reveal;
 *   animating geometry against a scroll correction is how this pattern breaks.
 * - **The past opens on its recent slice and the rest arrives by scrolling.**
 *   A sentinel just below the rendered history reveals the next chunk as the
 *   reader approaches it. The whole history is already in memory — the fetch is
 *   one document — so this is a *rendering* window, not a network one: the
 *   reveal is instant, and there is nothing to spin, skeleton or fade while
 *   waiting for. It replaced a "Show earlier sessions" button, which asked the
 *   reader to keep saying yes to the only thing they could have wanted. Chunks
 *   append *below* the sentinel, so the reveal grows away from everything being
 *   read and needs no scroll correction in that direction; the appended rows are
 *   ordinary list items, and plain keyboard scrolling trips the sentinel exactly
 *   as a wheel does.
 * - **Month dividers** mark each boundary the scroll crosses, which is what
 *   turns a year of near-identical weekly dates back into something scannable.
 *   They are computed over the whole visible run, so revealing the future never
 *   produces the same month labelled twice.
 *
 * What the shell does *not* own is what a row says: the card, the marker's tone,
 * and any editing wrapped around either. A gedu's feed is a work queue with
 * editors, completeness states and a roster; a family's is read-only prose about
 * one child. Those are two skins over one grammar, and keeping the grammar here
 * is what stops them drifting apart on where "next" is, on what a month boundary
 * looks like, or on how much of the past is on screen.
 *
 * The empty case belongs to the caller: a feed with no entries has a sentence to
 * say, and which sentence depends on who is reading.
 */
export function SessionFeedShell<T extends FeedShellEntry>({
  entries,
  markerClass,
  renderItem,
  registerRow,
  className,
}: SessionFeedShellProps<T>) {
  const locale = useLocale();
  const timeZone = useTimezone();

  const [laterOpen, setLaterOpen] = useState(false);
  const [chunksRevealed, setChunksRevealed] = useState(0);

  const anchor = useViewportAnchor();
  const dividerRef = useRef<HTMLLIElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  /** Named so the divider's toggle can say which region it reveals into. */
  const listId = useId();

  const { laterFuture, nextSession, past } = useMemo(
    () => partitionFeedEntries(entries),
    [entries],
  );
  const pastWindow = pastEntryWindow(past.length, chunksRevealed);
  const newestPastId = useMemo(() => newestPastEntryId(past), [past]);

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
  const rows = useMemo((): ShellRow<T>[] => {
    const visible: T[] = [
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

  /**
   * Reveal the next chunk of history as the sentinel comes into view.
   *
   * Re-armed on every reveal, which is what makes a run of chunks work: an
   * observer only reports a *change* of intersection, so a sentinel that is
   * still on screen after a reveal would never fire again. Rebuilding the
   * observer asks the question afresh, and it answers immediately while the
   * sentinel is still in view — so a tall viewport walks through several chunks
   * in as many frames and then stops, because the last reveal unmounts the
   * sentinel and this effect finds nothing to observe.
   */
  useEffect(() => {
    const node = sentinelRef.current;
    if (node === null) return;
    const observer = new IntersectionObserver(
      (observed) => {
        if (observed.some((entry) => entry.isIntersecting)) {
          setChunksRevealed((revealed) => revealed + 1);
        }
      },
      { rootMargin: SENTINEL_ROOT_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [pastWindow.remaining]);

  const toggleLater = () => {
    // Captured before the state change, while the divider is still where the
    // reader can see it. No hold: this reveal does not animate, so the geometry
    // is final by the time the correction runs.
    anchor.capture(dividerRef.current);
    setLaterOpen((open) => !open);
  };

  const renderRow = (row: ShellRow<T>) => {
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
    const context: SessionFeedRowContext = {
      prominent: entry.id === nextSession?.id,
      newestPast: entry.id === newestPastId,
    };

    return (
      <li
        key={row.key}
        ref={(node) => registerRow?.(entry.id, node)}
        className="relative"
      >
        <span
          aria-hidden
          className={cn(
            "absolute -left-6 h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-4 ring-background",
            markerClass(entry, context),
          )}
        />
        {renderItem(entry, context)}
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

      {/* Nothing to see and nothing to read: a hairline the observer watches for,
          carrying no content of its own, so the only thing a reader ever notices
          about it is more of the term appearing as they scroll. It unmounts once
          the whole history is on screen, which is what stops the observer. */}
      {pastWindow.remaining > 0 && (
        <div ref={sentinelRef} aria-hidden className="h-px" />
      )}
    </div>
  );
}
