import { SESSION_RECORDING_EPOCH } from "@/lib/constants/session-epoch";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import {
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
 * - **Kind comes from dates, never from a column.** `now` against the session's
 *   *start* splits future from past — which is what opens the record editor, and
 *   why roll call works mid-session. `now` against its *end*, together with the
 *   enforcement epoch, decides whether anything is owed: a session still running
 *   is editable but not yet outstanding work, which is the same boundary the
 *   dashboard's SQL count draws. The product's start floors how far back the
 *   walk goes at all.
 *
 * Pure: no React, no network, no clock of its own. The caller passes `now`, so
 * SSR and the first client render agree and a test can stand anywhere in time.
 */

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
 * Which kind of entry one date is, from the dates that decide it.
 *
 * **Editability turns on the start; being owed turns on the end.** A session
 * that has begun is a past entry and opens its record editor from that instant,
 * which is what makes roll call during the club work — the server accepts marks
 * from the same moment. But nothing is *owed* until the session has actually
 * finished: an hour that is still running is not yet work outstanding, and an
 * amber warning against a session the gedu is in the middle of teaching is a nag
 * for a job they have not had the chance to finish. That is also exactly where
 * the dashboard badge draws its line, so the card and the badge agree.
 *
 * The pre-epoch branch is the other one worth reading twice. A session dated
 * before the epoch with **nothing recorded on it** is a `no_record` line:
 * nothing was ever asked for, so it renders muted and never alerts — but it is
 * still fully editable, because a gedu is allowed to write up any session back
 * to the product's start. The moment anything *is* recorded on it, it becomes an
 * ordinary past entry that simply never owes anything (`owed: false`), so the
 * amber warning can never apply to it while the green check still can.
 *
 * Note which of the two questions the `no_record` test asks: the **epoch** one,
 * not `owed`. A live session inside the enforcement era owes nothing yet, and
 * collapsing it to a muted gap on that basis would take its editor away at
 * precisely the moment the gedu wants it.
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
  const withinEnforcement = date >= epoch;
  // The end instant, not the start: a session under way is editable but not yet
  // owed. Same boundary the SQL attention count uses.
  const finished = endsAt.getTime() <= now.getTime();

  if (row === undefined && !withinEnforcement) {
    return { kind: "no_record", id, startsAt, endsAt };
  }

  return {
    kind: "past",
    id,
    startsAt,
    endsAt,
    owed: withinEnforcement && finished,
    report: row?.report ?? null,
    staffNote: row?.gedu_note ?? null,
    attendance: row?.attendance ?? {},
  };
}
