import { VOICE_CONFIG } from "@/lib/constants/voice";
import { breaksInFeed, type HolidayBreak } from "@/lib/holiday-breaks";
import {
  OPEN_ENDED_OCCURRENCE_CAP,
  cutStartsAt,
  trimOpenEndedFuture,
  type PlannedSession,
} from "@/lib/planned-sessions";
import { holidayEntryId, sessionEntryId } from "@/lib/session-occurrence";
import type {
  FamilyProductGedu,
  FamilySessionEntry,
} from "@/components/family/product-page/types";
import type {
  FamilyFeedCancellation,
  FamilyFeedSession,
} from "@/services/family-product-feed/family-product-feed.contracts";

/**
 * Turning one group's stored session rows and its product's planned sessions
 * into the feed a **family** reads.
 *
 * **Why this is a second builder rather than a widened first one.** The gedu's
 * workspace lays the same records over the same plan, and generalizing
 * that function over both surfaces was considered and rejected: the shape it
 * emits is where the privacy line is drawn. Its entry union carries a gedu note,
 * the whole group's attendance map and an `owed` flag; this one carries a report
 * and one child's mark, and has no field the other three could arrive in. A
 * builder generic over its output type would have to take them all as optional
 * and trust each caller to pass the right subset — which is exactly the
 * remember-the-rule arrangement the split exists to replace. What the two do
 * share is the plan's shaping, and that lives in `planned-sessions` where both
 * read it.
 *
 * **The database plans the dates; this module lays the records over them.** The
 * document arrives with the product's planned sessions already expanded and
 * the stored rows beside them; the cut of an open-ended plan, the merge of rows
 * over the planned sessions and the derivation of what kind of entry each date
 * is all happen here, once, in front of one clock.
 *
 * Three ideas do the work, and two of them are the gedu builder's:
 *
 * - **A session is a (group, product-local date).** That is the row's unique key
 *   in Postgres and the entry's identity here, so a planned session and a row
 *   for the same day meet on the same map key.
 * - **Records beat the plan.** Where both exist the row wins outright,
 *   including its snapshotted start and end — a row was written about a session
 *   that ran at a particular hour, and an admin moving the club an hour later
 *   next term must not retroactively rewrite what happened last term. A row the
 *   plan no longer holds at all still renders, for the same reason.
 * - **Kind is only whether the evening is over.** There are two family kinds,
 *   not three: the gedu's `no_record` exists to hold the enforcement epoch,
 *   which decides what *staff* are owed and means nothing to a parent. To a
 *   family, a pre-epoch session and last week's unwritten one are the same
 *   thing — a session that ran with nothing written down — and both render as
 *   the quiet placeholder line. The epoch never reaches this surface. The line
 *   between the two kinds is drawn at the session's **end**, not its start, and
 *   the gedu builder now draws it in the same place — see `toFamilyEntry`.
 *
 * A holiday break is the one entry that is not a session: the plan never held
 * its dates, so it arrives beside the plan rather than in it, and is drawn as
 * one line per break, in date order by the sessions it withdrew.
 *
 * Pure: no React, no network, no clock of its own. The caller passes `now`, so
 * SSR and the first client render agree and a test can stand anywhere in time.
 */

export interface FamilySessionFeedArgs {
  /** Half of every entry id, and the group whose rows these are. */
  groupId: string;
  /**
   * The product's planned sessions as the family document carries them,
   * soonest first: to the end date on a dated product, past the shared horizon
   * on an open-ended one, and in either case on to the paid-through date of a
   * cancelled membership.
   */
  plannedSessions: readonly PlannedSession[];
  /** The product has no end date. */
  openEnded: boolean;
  /** Every stored row for the group, in any order. */
  sessions: readonly FamilyFeedSession[];
  /**
   * The group's cancelled sessions. Each replaces its date's entry with a
   * cancelled one, and one on a date the feed would not otherwise show is
   * inert.
   */
  cancellations: readonly FamilyFeedCancellation[];
  /**
   * The holiday breaks of the calendars the product follows, as the document
   * carries them. Each becomes one line where it withdrew a session the feed
   * would otherwise show, and none where it did not.
   */
  holidayBreaks: readonly HolidayBreak[];
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
    plannedSessions,
    openEnded,
    sessions,
    cancellations,
    holidayBreaks,
    now,
    accessUntil = null,
  } = args;

  /**
   * The planned sessions the feed shows, keyed by product-local date.
   *
   * Uncut whenever something terminal bounds the run — the product's end date,
   * or a cancellation's paid-through instant — so the run reads to its actual
   * last session. Only a genuinely open-ended, uncancelled product is cut to
   * the shared horizon: everything that has started plus the next eight still
   * open, the same number of future sessions every other surface in the app
   * shows. A session stays open for the voice room's closing margin after it
   * ends, so one that has just finished is not missing from the feed.
   */
  const shown =
    openEnded && accessUntil === null
      ? trimOpenEndedFuture(
          plannedSessions,
          now,
          OPEN_ENDED_OCCURRENCE_CAP,
          VOICE_CONFIG.SESSION_WINDOW_AFTER_MINUTES * 60_000,
        )
      : plannedSessions;
  // First writer wins, so two slots on one weekday are the date's earlier
  // session: the plan is soonest first, and an entry is one per date.
  const planned = new Map<string, { startsAt: Date; endsAt: Date }>();
  for (const session of shown) {
    if (planned.has(session.date)) continue;
    planned.set(session.date, {
      startsAt: session.startsAt,
      endsAt: session.endsAt,
    });
  }

  const rowsByDate = new Map(
    sessions.map((session) => [session.session_date, session]),
  );
  const cancelledDates = new Set(
    cancellations.map((cancellation) => cancellation.session_date),
  );

  const dates = new Set([...planned.keys(), ...rowsByDate.keys()]);
  const entries: FamilySessionEntry[] = [];

  for (const date of dates) {
    const row = rowsByDate.get(date);

    // The row's snapshot wins outright when there is one. A date reached this
    // loop because at least one of the two produced it, so the planned session
    // is there whenever the row is not — the guard is for the compiler, and it
    // costs nothing to let it also be true.
    const when =
      row === undefined
        ? planned.get(date)
        : { startsAt: new Date(row.starts_at), endsAt: new Date(row.ends_at) };
    if (when === undefined) continue;

    // Nothing past the paid window renders, planned or stored. The plan runs
    // to the paid-through *date*, so a session later that day is cut here; and
    // a stored row past the window is still a row the family may not see *as
    // theirs to come*, because a row exists whether or not the plan holds it.
    if (
      accessUntil !== null &&
      when.startsAt.getTime() > accessUntil.getTime()
    ) {
      continue;
    }

    // A cancelled session stays in the feed in its dated place, so a family
    // sees that the date is off rather than finding it missing. The
    // cancellation wins over any stored row on the date: the family document
    // already leaves such a row out, and the entry carries nothing of one if
    // it arrives anyway, so a report on a cancelled session never shows. A
    // cancelled record the plan no longer holds has no instants here
    // at all — its row does not travel — so that date simply is not drawn.
    if (cancelledDates.has(date)) {
      entries.push({
        kind: "cancelled",
        id: sessionEntryId(groupId, date),
        sessionDate: date,
        startsAt: when.startsAt,
        endsAt: when.endsAt,
        upcoming: when.endsAt.getTime() > now.getTime(),
      });
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

  // A holiday break is one line, placed by the sessions it withdrew, and only
  // where at least one of them is inside what the feed shows: before the
  // open-ended cut, and inside the paid window. A break whose every withdrawn
  // session lies past either is not this family's to read about — the paid
  // window is the same hard clamp it is for sessions. Withdrawn sessions were
  // never in the plan, so they took no slot from the open-ended cap.
  const cut = cutStartsAt(plannedSessions, shown);
  const breaks = breaksInFeed(
    holidayBreaks,
    (session) =>
      (cut === null || session.startsAt.getTime() < cut.getTime()) &&
      (accessUntil === null ||
        session.startsAt.getTime() <= accessUntil.getTime()),
  );
  for (const { row, startsAt, endsAt } of breaks) {
    entries.push({
      kind: "holiday",
      id: holidayEntryId(row.id),
      startsAt,
      endsAt,
      startDate: row.startDate,
      endDate: row.endDate,
      names: row.names,
      upcoming: endsAt.getTime() > now.getTime(),
    });
  }

  // Descending by start, which the feed shell reads as one leading run of
  // future entries followed by the past. That the run stays contiguous while
  // the *kinds* are decided by `endsAt` is not luck: entries are keyed by
  // product-local date, so there is at most one per day and no two can overlap
  // in time — a break's line spans days, but every one of its dates was
  // withdrawn from the plan, so no session falls inside it. Ordering by start
  // and ordering by end are therefore the same ordering, and a future entry can
  // never sort below a past one.
  entries.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return entries;
}

/**
 * Which kind of entry one occurrence is, and what the family may read on it.
 *
 * **The boundary is the session's end, and both builders now draw it there.**
 * The only question either surface asks of the clock is whether the evening is
 * over, and a club running right now is emphatically not over: it is the
 * session the family is *in*, and the one the gedu is standing in.
 *
 * The gedu builder used to split on the *start*, and it is worth knowing why,
 * because the reason was real. Its split was doing double duty as "may I record
 * this yet" — making the running session `past` was how it got the record
 * editor, which is what roll call during the club needs. That conflated two
 * questions, and a long session made the cost obvious: on a daily 8:00–23:00
 * camp the gedu spent fifteen hours being told the session they were teaching
 * was history and that tomorrow was next, while the family looking at the same
 * hour was correctly told it was today's. The staff side now asks editability
 * directly, against the session's *start*, and its live entry carries the
 * record editor exactly as a past entry does — so the kind rule is free to mean
 * one thing on both feeds.
 *
 * So a session in progress stays `future`, and that is a contract with the
 * page rather than a preference. The feed's live tag is computed as
 * `kind === "future" && startsAt <= now < endsAt` — a conjunction a start-based
 * split makes unsatisfiable, which would leave a club running right now sitting
 * below the divider as a quiet "no write-up" line while next week is tagged
 * "Next session". The gedu feed computes its live tag from the identical
 * conjunction. **The two boundaries are deliberately the same instant**
 * (`endsAt`, exclusive), so the entry becomes past in exactly the tick the tag
 * stops being live and there is no window where one is true and the other is
 * not.
 *
 * **The voice window is deliberately not part of this.** It governs how long a
 * *room* stays joinable after a session, which is a fact about the room and not
 * about the evening. Stretching the future kind to `endsAt + windowClose` would
 * manufacture exactly the dead zone the paragraph above rules out: entries that
 * are `future` but not live, tagged "Next session" for a club that finished
 * twenty minutes ago. It still governs the cut of an open-ended plan — a
 * just-finished session is kept so it is not missing from the feed — but what kind it
 * then is, is decided here, by the clock alone.
 *
 * **A report is passed through verbatim, `null` included.** Whether one *exists*
 * is a trimmed test, and it is made where the entry is rendered — the same
 * trimmed test the gedu side and the dashboard's SQL twin make, so a report of
 * one newline is "no write-up" to every surface at once. Deciding it here would
 * put a second copy of that rule in a third place.
 *
 * **Photos come through in the order the RPC emitted them, and an occurrence
 * with no row has none.** They are content beside the report rather than a
 * state of it: they play no part in what a session owes, and the only thing
 * they change about an entry is that a past one carrying them has something to
 * show — which is what turns the quiet dashed line into a card at the renderer.
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

  const lastEditedBy = toLastEditedBy(row);

  if (endsAt.getTime() > now.getTime()) {
    return {
      kind: "future",
      id,
      startsAt,
      endsAt,
      report: row?.report ?? null,
      // Carried on a future entry because one of them can be the session **in
      // progress**, which is exactly the card a gedu is photographing from. An
      // occurrence with no stored row has none, which is the honest answer
      // rather than a placeholder.
      images: row?.images ?? [],
      lastEditedBy,
    };
  }

  return {
    kind: "past",
    id,
    startsAt,
    endsAt,
    report: row?.report ?? null,
    // Straight through in the RPC's own order — `(created_at, id)`, the display
    // order on every surface — because nothing here re-sorts what the database
    // already ordered.
    images: row?.images ?? [],
    attendance: row?.attendance ?? null,
    lastEditedBy,
  };
}

/**
 * The row's last editor, or `null`.
 *
 * **Both halves or nobody.** The id seeds an identicon and the name is what the
 * chip says, so an id without a name would render a face with nothing beside it
 * and a name without an id a degenerate square — neither is an attribution
 * anyone can read. An occurrence with no stored row behind it has no editor at
 * all, which is the same answer by a different route.
 *
 * It is the *session's* last editor rather than the report's author, and that
 * imprecision is a documented product decision — the entry field's own note
 * carries it.
 */
function toLastEditedBy(
  row: FamilyFeedSession | undefined,
): FamilyProductGedu | null {
  if (row === undefined) return null;
  return row.updated_by !== null && row.updated_by_first_name !== null
    ? { id: row.updated_by, firstName: row.updated_by_first_name }
    : null;
}
