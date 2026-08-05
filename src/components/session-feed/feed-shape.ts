/**
 * The structural arithmetic of a session feed: which entries are ahead of now,
 * which one is next, and how much of the past is on screen.
 *
 * Pure — no React, no clock, no locale, no entry type of its own. Everything
 * here is generic over the entry, which is the whole point: the gedu's
 * workspace feed and the family's read-only feed are two renderings of one
 * *grammar* — a descending run whose leading future block collapses behind a
 * divider, whose newest past entry is the one read in full, and whose older past
 * is revealed in chunks. The entries themselves are deliberately different types
 * (a family entry cannot hold a gedu note or another child's marks, and that is
 * enforced by its shape), so sharing the arithmetic means being generic over the
 * entry rather than over the feed. A second copy of this walk would be the thing
 * that lets the two feeds quietly disagree about where "next" is.
 */

/**
 * The minimum an entry has to be for the helpers below to shape it: an identity
 * and which side of the present it is on.
 */
interface FeedShapedEntry {
  id: string;
  kind: string;
}

/** A generic feed entry narrowed to the future side of the present. */
type FutureOf<T extends FeedShapedEntry> = Extract<T, { kind: "future" }>;

export interface FeedPartition<T extends FeedShapedEntry> {
  /**
   * Future sessions beyond the next one, still in the caller's descending
   * order (furthest away first). These collapse behind one row above the next
   * session, so the feed opens on "what's next and what just happened" rather
   * than on two months of empty calendar.
   */
  laterFuture: FutureOf<T>[];
  /**
   * The soonest session still ahead of us — the prominent entry at the head of
   * the feed. `null` once a product's schedule has run out.
   */
  nextSession: FutureOf<T> | null;
  /** Everything that has already happened, still descending. */
  past: T[];
}

/**
 * Whether an entry sits on the future side of the present, for any feed's own
 * entry union. It is purely structural, which is what the shared shaping needs —
 * a surface that additionally asks "and may this one be edited" answers that
 * with its own predicate, over its own entry union, in its own module.
 */
function isFutureEntry<T extends FeedShapedEntry>(entry: T): entry is FutureOf<T> {
  return entry.kind === "future";
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
export function partitionFeedEntries<T extends FeedShapedEntry>(
  entries: readonly T[],
): FeedPartition<T> {
  // Collected by walking rather than sliced-and-cast, so the narrowing is the
  // loop's own and no assertion has to be trusted.
  const future: FutureOf<T>[] = [];
  for (const entry of entries) {
    if (!isFutureEntry(entry)) break;
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
 * Entries of a kind that recorded nothing — a pre-epoch gap on the gedu's feed —
 * are stepped over rather than counted, since there is no report to leave open,
 * and a feed with no past at all answers `null`.
 */
export function newestPastEntryId<T extends FeedShapedEntry>(
  past: readonly T[],
): string | null {
  return past.find((entry) => entry.kind === "past")?.id ?? null;
}

/**
 * How many past entries the feed renders before the reader scrolls for more.
 *
 * A year-old club is 50+ sessions and the newest is always the one being read,
 * so the feed opens on the recent past and everything older waits just below
 * the fold. It is a *rendering* window and never a fetching one — the whole
 * history is already in memory — so the size is chosen for how much a browser
 * should paint at once, not for what a round trip costs.
 */
export const FEED_INITIAL_PAST_ENTRIES = 10;

/** How many more past entries each reveal adds as the reader reaches them. */
export const FEED_PAST_CHUNK_SIZE = 10;

export interface PastEntryWindow {
  /** How many of the past entries to render, newest first. */
  visible: number;
  /**
   * How many are still hidden — zero means the whole history is on screen and
   * there is nothing left for the feed's scroll sentinel to watch for.
   */
  remaining: number;
}

/**
 * Which slice of the past is on screen after `chunksRevealed` reveals.
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
