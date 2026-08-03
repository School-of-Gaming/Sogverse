import { formatInTimeZone } from "date-fns-tz";
import { SESSION_RECORDING_EPOCH } from "@/lib/constants/session-epoch";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import {
  endDateToCutoff,
  enumeratePastRowOccurrences,
  enumerateRowOccurrences,
  MAX_PAST_OCCURRENCES_PER_SLOT,
  OPEN_ENDED_OCCURRENCE_CAP,
  startDateToCutoff,
  type SlotShape,
} from "@/lib/session-occurrence";
import type { SessionFeedEntry } from "@/components/gedu/session-feed/types";
import type { GeduFeedSession } from "@/services/gedu-sessions/gedu-sessions.contracts";

/**
 * Turning one group's stored session rows and its product's weekly schedule
 * into the feed the workspace renders.
 *
 * **The RPC returns data; this module does the calendar math.** Nothing on the
 * server expands a schedule — that would be the third holiday-blind expansion in
 * the codebase and the second language it is written in. What comes back is the
 * schedule parameters, the rows, and the roster; the walk forward, the walk
 * backward, the merge of rows over projections and the derivation of what kind
 * of entry each date is all happen here, once, in front of one clock.
 *
 * Three ideas do all the work:
 *
 * - **A session is a (group, product-local date).** That is the row's unique key
 *   in Postgres and it is the entry's identity here, so a projection and a row
 *   for the same day are the same thing and meet on the same map key. The date
 *   survives the most common schedule edit there is — somebody fixing the time
 *   of day — which keying by instant or by slot start would not.
 * - **Records beat projections.** Where both exist the row wins outright,
 *   including its snapshotted start and end: a row was written about a session
 *   that ran at a particular hour, and an admin moving the club an hour later
 *   next term must not retroactively rewrite what happened last term. A row the
 *   schedule no longer projects at all — a weekday move orphans one — still
 *   renders, for the same reason.
 * - **Kind comes from three dates, never from a column.** `now` splits future
 *   from past, the enforcement epoch splits owed from merely editable, and the
 *   product's start floors how far back the walk goes at all.
 *
 * Pure: no React, no network, no clock of its own. The caller passes `now`, so
 * SSR and the first client render agree and a test can stand anywhere in time.
 */

/**
 * How far back an **undated** product's history is projected.
 *
 * Nearly every product carries a start date and that is the floor the walk
 * really wants; `start_date` is nullable for open-ended clubs, though, and a
 * missing one cannot mean "walk to the beginning of time" — the backward helper
 * would then run to its own 520-occurrence guard rail and hand the feed ten
 * years of dashed placeholder lines for a club nobody claims ran that long.
 *
 * A year is the honest answer to "how much history can we assume without being
 * told": long enough that a club running a full term or three reads completely,
 * short enough that the feed is not inventing a decade. Stored rows are never
 * subject to it — a row older than this still renders, because a row is a fact
 * rather than a projection.
 */
export const UNDATED_PRODUCT_PAST_HORIZON_DAYS = 365;

/**
 * The feed entry's stable id: the group and the product-local date it happened
 * on.
 *
 * Deliberately not the row's primary key, because most entries have no row —
 * and the ones that do acquire one the moment a gedu writes anything, which
 * would change the id of the card they are typing into. `${group}:${date}` is
 * the same string before and after materialization, which is what lets the
 * scroll anchor, the open-editor state and React's own reconciliation survive a
 * save.
 */
export function sessionEntryId(groupId: string, sessionDate: string): string {
  return `${groupId}:${sessionDate}`;
}

/** `YYYY-MM-DD` as the instant falls in the product's own zone. */
export function productLocalDate(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, "yyyy-MM-dd");
}

export interface GeduSessionFeedArgs {
  /** Half of every entry id, and the group whose rows these are. */
  groupId: string;
  /** The product's authoring zone — every session date is local to it. */
  timezone: string;
  slots: readonly SlotShape[];
  /** Product-local `YYYY-MM-DD`, or `null` on an open-ended product. */
  startDate: string | null;
  endDate: string | null;
  /** Every stored row for this group, in any order. */
  sessions: readonly GeduFeedSession[];
  now: Date;
  /**
   * The product-local date from which write-ups are owed. Defaults to the
   * global constant; a test passes its own so it can stand either side of it.
   */
  epoch?: string;
}

/**
 * Build one group's feed, **strictly newest first**: the future horizon at the
 * head (furthest away first, so the next session is the last of them), then the
 * run of the term backwards beneath it.
 *
 * The future horizon matches what every other list in the app shows — the next
 * eight occurrences on an open-ended product, everything to the end date on a
 * dated one — so a gedu's view of a club reaches exactly as far ahead as the
 * parent's does.
 */
export function buildGeduSessionFeed(
  args: GeduSessionFeedArgs,
): SessionFeedEntry[] {
  const {
    groupId,
    timezone,
    slots,
    startDate,
    endDate,
    sessions,
    now,
    epoch = SESSION_RECORDING_EPOCH,
  } = args;

  const startBoundary = startDateToCutoff(startDate, timezone);
  const endBoundary = endDateToCutoff(endDate, timezone);
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
      cap:
        endDate === null ? OPEN_ENDED_OCCURRENCE_CAP : Number.POSITIVE_INFINITY,
      windowCloseMs: VOICE_CONFIG.SESSION_WINDOW_AFTER_MINUTES * 60_000,
    })) {
      project(occurrence);
    }

    for (const occurrence of enumeratePastRowOccurrences({
      slots: slotList,
      timezone,
      now,
      floor: startBoundary ?? undatedFloor(now),
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
  const entries: SessionFeedEntry[] = [];

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

    entries.push(
      toEntry({
        id: sessionEntryId(groupId, date),
        date,
        startsAt: when.startsAt,
        endsAt: when.endsAt,
        row,
        now,
        epoch,
      }),
    );
  }

  entries.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return entries;
}

/**
 * Which kind of entry one date is, from the three dates that decide it.
 *
 * The pre-epoch branch is the one worth reading twice. A session dated before
 * the epoch with **nothing recorded on it** is a `no_record` line: nothing was
 * ever asked for, so it renders muted and never alerts — but it is still fully
 * editable, because a gedu is allowed to write up any session back to the
 * product's start. The moment anything *is* recorded on it, it becomes an
 * ordinary past entry that simply never owes anything (`owed: false`), so the
 * warning rung of the ladder can never apply to it while the success rung
 * still can.
 */
function toEntry(args: {
  id: string;
  date: string;
  startsAt: Date;
  endsAt: Date;
  row: GeduFeedSession | undefined;
  now: Date;
  epoch: string;
}): SessionFeedEntry {
  const { id, date, startsAt, endsAt, row, now, epoch } = args;

  if (startsAt.getTime() > now.getTime()) {
    return {
      kind: "future",
      id,
      startsAt,
      endsAt,
      report: row?.report ?? null,
      staffNote: row?.gedu_note ?? null,
    };
  }

  // Both dates are product-local `YYYY-MM-DD`, so a lexicographic comparison is
  // a calendar one — and it is made in the product's own terms, which is the
  // only zone in which "the session's date" means anything.
  const owed = date >= epoch;

  if (row === undefined && !owed) {
    return { kind: "no_record", id, startsAt, endsAt };
  }

  return {
    kind: "past",
    id,
    startsAt,
    endsAt,
    owed,
    report: row?.report ?? null,
    staffNote: row?.gedu_note ?? null,
    attendance: row?.attendance ?? {},
  };
}

/** The backward floor for a product that never declared a start date. */
function undatedFloor(now: Date): Date {
  return new Date(
    now.getTime() - UNDATED_PRODUCT_PAST_HORIZON_DAYS * 24 * 60 * 60 * 1000,
  );
}
