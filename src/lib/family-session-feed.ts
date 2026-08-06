import { VOICE_CONFIG } from "@/lib/constants/voice";
import {
  earlierBoundary,
  endDateToCutoff,
  enumeratePastRowOccurrences,
  enumerateRowOccurrences,
  MAX_PAST_OCCURRENCES_PER_SLOT,
  OPEN_ENDED_OCCURRENCE_CAP,
  productLocalDate,
  sessionEntryId,
  startDateToCutoff,
  undatedPastFloor,
  type SlotShape,
} from "@/lib/session-occurrence";
import type { FamilySessionEntry } from "@/components/family/product-page/types";
import type { FamilyFeedSession } from "@/services/family-product-feed/family-product-feed.contracts";

/**
 * Turning one group's stored session rows and its product's weekly schedule
 * into the feed a **family** reads.
 *
 * **Why this is a second builder rather than a widened first one.** The gedu's
 * workspace builds the same two walks over the same primitives, and generalizing
 * that function over both surfaces was considered and rejected: the shape it
 * emits is where the privacy line is drawn. Its entry union carries a gedu note,
 * the whole group's attendance map and an `owed` flag; this one carries a report
 * and one child's mark, and has no field the other three could arrive in. A
 * builder generic over its output type would have to take them all as optional
 * and trust each caller to pass the right subset — which is exactly the
 * remember-the-rule arrangement the split exists to replace. What the two do
 * share is the arithmetic, and that lives in `session-occurrence` where both
 * read it.
 *
 * **The RPC returns data; this module does the calendar math.** Nothing on the
 * server expands a schedule. What comes back is the schedule parameters and the
 * stored rows; the walk forward, the walk backward, the merge of rows over
 * projections and the derivation of what kind of entry each date is all happen
 * here, once, in front of one clock.
 *
 * Three ideas do the work, and two of them are the gedu builder's:
 *
 * - **A session is a (group, product-local date).** That is the row's unique key
 *   in Postgres and the entry's identity here, so a projection and a row for the
 *   same day meet on the same map key.
 * - **Records beat projections.** Where both exist the row wins outright,
 *   including its snapshotted start and end — a row was written about a session
 *   that ran at a particular hour, and an admin moving the club an hour later
 *   next term must not retroactively rewrite what happened last term. A row the
 *   schedule no longer projects at all still renders, for the same reason.
 * - **Kind is only which side of now the session is on.** There are two family
 *   kinds, not three: the gedu's `no_record` exists to hold the enforcement
 *   epoch, which decides what *staff* are owed and means nothing to a parent. To
 *   a family, a pre-epoch session and last week's unwritten one are the same
 *   thing — a session that ran with nothing written down — and both render as
 *   the quiet placeholder line. The epoch never reaches this surface.
 *
 * Pure: no React, no network, no clock of its own. The caller passes `now`, so
 * SSR and the first client render agree and a test can stand anywhere in time.
 */

export interface FamilySessionFeedArgs {
  /** Half of every entry id, and the group whose rows these are. */
  groupId: string;
  /** The product's authoring zone — every session date is local to it. */
  timezone: string;
  slots: readonly SlotShape[];
  /** Product-local `YYYY-MM-DD`, or `null` on an open-ended product. */
  startDate: string | null;
  endDate: string | null;
  /** Every stored row for the group, in any order. */
  sessions: readonly FamilyFeedSession[];
  now: Date;
  /**
   * The instant paid access ends, when the parent has cancelled this
   * enrollment's subscription. `null` — the ordinary case — means the product's
   * own end date is the only bound there is.
   *
   * **This is the family builder's one extra input, and it is a hard clamp**:
   * nothing past the paid window renders anywhere, so the page's future block
   * stops at the same instant the dashboard card's next session and the
   * dashboard's sort do. A family looking at a club they have cancelled sees the
   * sessions they are entitled to attend and no others — a listed session
   * nobody may turn up to is a promise the platform will not keep.
   */
  accessUntil?: Date | null;
}

/**
 * Build one enrollment's feed, **strictly newest first**: the future horizon at
 * the head (furthest away first, so the next session is the last of them), then
 * the group's history running backwards beneath it.
 *
 * **The history is the group's, not the child's.** Sessions from before this
 * child joined are included deliberately — group membership grants what any
 * member of the group sees, and back-reading is context rather than leakage.
 * (Their attendance on those dates is simply `null`: nobody marked a child who
 * was not there to mark.)
 */
export function buildFamilySessionFeed(
  args: FamilySessionFeedArgs,
): FamilySessionEntry[] {
  const {
    groupId,
    timezone,
    slots,
    startDate,
    endDate,
    sessions,
    now,
    accessUntil = null,
  } = args;

  const startBoundary = startDateToCutoff(startDate, timezone);
  // Whichever runs out first. A cancelled open-ended club has no end date and
  // still has a last day; a cancelled camp keeps whichever of the two is
  // sooner. Both walks take the same boundary, so the clamp is one decision
  // rather than a rule applied twice and eventually only once.
  const endBoundary = earlierBoundary(
    endDateToCutoff(endDate, timezone),
    accessUntil,
  );
  const slotList = [...slots];

  /**
   * Projected occurrences, keyed by product-local date. First writer wins,
   * which matters exactly once: a session already in progress is emitted by
   * both walks (the forward one surfaces it deliberately, the backward one
   * because it has already started), and the two agree on the instant anyway.
   */
  const projected = new Map<string, { startsAt: Date; endsAt: Date }>();
  const project = (occurrence: { start: Date; end: Date }) => {
    const date = productLocalDate(occurrence.start, timezone);
    if (projected.has(date)) return;
    projected.set(date, { startsAt: occurrence.start, endsAt: occurrence.end });
  };

  if (slotList.length > 0) {
    for (const occurrence of enumerateRowOccurrences({
      slots: slotList,
      timezone,
      now,
      startBoundary,
      endBoundary,
      // Uncapped whenever something terminal bounds the walk — the product's
      // end date, or a cancellation's paid-through instant — so the run reads
      // to its actual last session. Only a genuinely open-ended, uncancelled
      // product needs the shared horizon, which is the same number of future
      // sessions every other surface in the app shows.
      cap:
        endBoundary === null
          ? OPEN_ENDED_OCCURRENCE_CAP
          : Number.POSITIVE_INFINITY,
      windowCloseMs: VOICE_CONFIG.SESSION_WINDOW_AFTER_MINUTES * 60_000,
    })) {
      project(occurrence);
    }

    for (const occurrence of enumeratePastRowOccurrences({
      slots: slotList,
      timezone,
      now,
      floor: startBoundary ?? undatedPastFloor(now),
      endBoundary,
      maxOccurrences: MAX_PAST_OCCURRENCES_PER_SLOT,
    })) {
      project(occurrence);
    }
  }

  const rowsByDate = new Map(
    sessions.map((session) => [session.session_date, session]),
  );

  const dates = new Set([...projected.keys(), ...rowsByDate.keys()]);
  const entries: FamilySessionEntry[] = [];

  for (const date of dates) {
    const row = rowsByDate.get(date);

    // The row's snapshot wins outright when there is one. A date reached this
    // loop because at least one of the two produced it, so the projection is
    // there whenever the row is not — the guard is for the compiler, and it
    // costs nothing to let it also be true.
    const when =
      row === undefined
        ? projected.get(date)
        : { startsAt: new Date(row.starts_at), endsAt: new Date(row.ends_at) };
    if (when === undefined) continue;

    // A stored row past the paid window is still a row the family may not see
    // *as theirs to come*, so the clamp applies to rows as well as projections.
    // Both walks already stop there; this is the case they cannot catch,
    // because a row exists whether or not anything projected it.
    if (
      accessUntil !== null &&
      when.startsAt.getTime() > accessUntil.getTime()
    ) {
      continue;
    }

    entries.push(
      toFamilyEntry({
        id: sessionEntryId(groupId, date),
        startsAt: when.startsAt,
        endsAt: when.endsAt,
        row,
        now,
      }),
    );
  }

  entries.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return entries;
}

/**
 * Which kind of entry one occurrence is, and what the family may read on it.
 *
 * **Only the start matters.** A session that has begun is a past entry, because
 * the only question this surface asks is whether the evening has happened —
 * there is nothing here to edit and nothing here that could be owed, so neither
 * the end instant nor the enforcement epoch has a job to do.
 *
 * **A report is passed through verbatim, `null` included.** Whether one *exists*
 * is a trimmed test, and it is made where the entry is rendered — the same
 * trimmed test the gedu side and the dashboard's SQL twin make, so a report of
 * one newline is "no write-up" to every surface at once. Deciding it here would
 * put a second copy of that rule in a third place.
 *
 * **`attendance: null` is unmarked, and it stays a third state.** It is not
 * "absent": nobody answered for this child on this date, which is a gap in the
 * gedu's paperwork rather than a claim about the child. The entry carries the
 * distinction and the renderer shows nothing at all for it. A future entry has
 * no attendance field at all — a session that has not happened cannot have been
 * attended, so there is nothing to represent.
 */
function toFamilyEntry(args: {
  id: string;
  startsAt: Date;
  endsAt: Date;
  row: FamilyFeedSession | undefined;
  now: Date;
}): FamilySessionEntry {
  const { id, startsAt, endsAt, row, now } = args;

  if (startsAt.getTime() > now.getTime()) {
    return {
      kind: "future",
      id,
      startsAt,
      endsAt,
      report: row?.report ?? null,
    };
  }

  return {
    kind: "past",
    id,
    startsAt,
    endsAt,
    report: row?.report ?? null,
    attendance: row?.attendance ?? null,
  };
}
