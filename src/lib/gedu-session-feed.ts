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
import type {
  SessionEditor,
  SessionFeedEntry,
} from "@/components/gedu/session-feed";
import type { GeduFeedSession } from "@/services/gedu-sessions/gedu-sessions.contracts";

/**
 * Turning one group's stored session rows and its product's weekly schedule
 * into the feed the workspace renders.
 *
 * **The RPC returns data; this module does the calendar math.** Nothing on the
 * server expands a schedule — that would be the third schedule expansion in the
 * codebase and the second language it is written in. What comes back is the
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
 *   *end* splits future from past, so a session in progress is the **current**
 *   one rather than history — the same rule the family feed uses, because the
 *   two are one timeline read by two audiences. That same end instant, together
 *   with the enforcement epoch, decides whether anything is owed. Editability is
 *   the one question that turns on the *start*: the register opens when the
 *   session begins, which is why roll call works mid-session, and the feed asks
 *   it directly rather than reading it off the kind. The product's start floors
 *   how far back the walk goes at all.
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
 * **The kind flips at the session's END, which is the rule the family feed
 * uses too.** A session is `future` until its last minute has passed, so the one
 * happening right now is the *current* session — the last of the future run,
 * sitting at the top of the feed where the gedu is already looking — rather than
 * something filed under history. The two feeds share the rule deliberately: they
 * are one timeline read by two audiences, and a classifier that disagreed meant
 * a club running at 14:00 was "today's session" to the parent and "last time" to
 * the gedu standing in it. A long session is what makes this visible — on a
 * daily 8:00–23:00 camp the old start-based split spent fifteen hours calling
 * the session in progress history and naming tomorrow as next.
 *
 * **Three questions, three instants, and they are no longer collapsed into
 * one.** The start-based split was really editability wearing the kind's
 * clothes:
 *
 * - **Which kind** — the session's **end**. Drives position in the feed and the
 *   tag on the card.
 * - **Whether it is editable** — the session's **start**. The register opens
 *   when the session begins and the server accepts marks from that same moment,
 *   so a running session is editable. That is the roll-call case, and it is the
 *   whole reason the kind used to flip at the start: making the running session
 *   `past` was how it got the record editor. It no longer has to be, because the
 *   feed asks editability directly and the live entry carries the record editor
 *   exactly as a past entry does.
 * - **Whether anything is owed** — the session's **end**, plus the epoch. An
 *   hour the gedu is still standing in is not work outstanding. Untouched by
 *   this change, and still the boundary the SQL attention count draws, so the
 *   dashboard badge and the card go on agreeing.
 *
 * Because the kind now flips at the end, everything reaching the `past` branch
 * has by definition finished — so `owed` no longer re-tests it and the epoch is
 * the only question left there.
 *
 * The pre-epoch branch is the other one worth reading twice. A session dated
 * before the epoch with **nothing recorded on it** is a `no_record` line:
 * nothing was ever asked for, so it renders muted and never alerts — but it is
 * still fully editable, because a gedu is allowed to write up any session back
 * to the product's start. The moment anything *is* recorded on it, it becomes an
 * ordinary past entry that simply never owes anything (`owed: false`), so the
 * amber warning can never apply to it while the green check still can.
 *
 * A running session can never reach that branch whatever its date: it is
 * `future` now, and the epoch test sits below the end-based split.
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

  if (endsAt.getTime() > now.getTime()) {
    return {
      kind: "future",
      id,
      startsAt,
      endsAt,
      report: row?.report ?? null,
      staffNote: row?.gedu_note ?? null,
      // Carried on a future entry because one of them can be **in progress**,
      // and the register opens at the start. For a session that has not begun
      // this is `{}` and stays that way — the server refuses a mark before the
      // start instant — so the field is "what has been said so far", which is
      // honestly nothing until the club opens the door.
      attendance: row?.attendance ?? {},
      // Carried on a future entry for the same reason the marks are: one of
      // them can be the session in progress, and that is the card a gedu is
      // looking at while there is something worth photographing in front of
      // them. An occurrence with no stored row has none, which is the honest
      // answer rather than a placeholder.
      images: row?.images ?? [],
      lastEditedBy: toLastEditedBy(row),
    };
  }

  // Both dates are product-local `YYYY-MM-DD`, so a lexicographic comparison is
  // a calendar one — and it is made in the product's own terms, which is the
  // only zone in which "the session's date" means anything.
  const withinEnforcement = date >= epoch;

  if (row === undefined && !withinEnforcement) {
    return { kind: "no_record", id, startsAt, endsAt };
  }

  return {
    kind: "past",
    id,
    startsAt,
    endsAt,
    // No end test here any more: reaching this branch *is* having finished,
    // since the kind flips at the end instant a few lines up. The epoch is the
    // only remaining question, and it is the same one the SQL count asks.
    owed: withinEnforcement,
    report: row?.report ?? null,
    staffNote: row?.gedu_note ?? null,
    reportEmailedAt: toReportEmailedAt(row),
    attendance: row?.attendance ?? {},
    // Straight through in the RPC's own order — `(created_at, id)`, which is
    // the display order everywhere — because nothing here re-sorts what the
    // database already ordered.
    images: row?.images ?? [],
    lastEditedBy: toLastEditedBy(row),
  };
}

/**
 * When the row's report was emailed to the families, as an **instant**, or
 * `null`.
 *
 * A Date rather than the stored string, so the card renders it in the viewer's
 * zone through the same formatter every other clock face in the feed goes
 * through. An occurrence with no row behind it answers the same as a row nobody
 * has emailed, which is the truth in both cases: nothing has been sent.
 */
function toReportEmailedAt(row: GeduFeedSession | undefined): Date | null {
  const stamped = row?.report_emailed_at ?? null;
  return stamped === null ? null : new Date(stamped);
}

/**
 * The row's last editor, or `null`.
 *
 * **Both halves or nobody.** The id seeds an identicon and the name is what the
 * chip says, so an id without a name would render a face with nothing beside it
 * and a name without an id a degenerate square — neither is an attribution
 * anyone can read. An occurrence with no stored row behind it has no editor at
 * all, which is the same answer by a different route, and the `no_record` kind
 * has no field to put one in for exactly that reason.
 *
 * It is the *session's* last editor rather than the report's author, and that
 * imprecision is a documented product decision — the editor type's own note
 * carries it.
 */
function toLastEditedBy(row: GeduFeedSession | undefined): SessionEditor | null {
  if (row === undefined) return null;
  return row.updated_by !== null && row.updated_by_first_name !== null
    ? { id: row.updated_by, firstName: row.updated_by_first_name }
    : null;
}
