import { SESSION_RECORDING_EPOCH } from "@/lib/constants/session-epoch";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { breaksInFeed, type HolidayBreak } from "@/lib/holiday-breaks";
import {
  OPEN_ENDED_OCCURRENCE_CAP,
  cutStartsAt,
  trimOpenEndedFuture,
  type PlannedSession,
} from "@/lib/planned-sessions";
import { holidayEntryId, sessionEntryId } from "@/lib/session-occurrence";
import {
  deriveSessionStaffing,
  type SubstitutionRequestInput,
  type SessionStaffing,
  type StaffingAssignment,
} from "@/lib/session-staffing";
import type {
  SessionEditor,
  SessionFeedEntry,
} from "@/components/gedu/session-feed";
import type {
  GeduFeedSession,
  SessionCancellation,
  TraineeFeedSession,
} from "@/services/gedu-sessions/gedu-sessions.contracts";
import { WITHHELD } from "@/lib/withheld";
import type {
  SubstitutionRequestDocument,
  SessionStaffGedu,
} from "@/services/session-substitution/session-substitution.contracts";

/**
 * Turning one group's stored session rows and its product's planned sessions
 * into the feed the workspace renders.
 *
 * **The database plans the dates; this module lays the records over them.** The
 * document arrives with the product's planned sessions already expanded, by the
 * one expansion of the plan there is. What happens here is the cut of an
 * open-ended plan to the horizon every list shows, the merge of rows over the
 * planned sessions and the derivation of what kind of entry each date is —
 * once, in front of one clock.
 *
 * Four ideas do all the work:
 *
 * - **A session is a (group, product-local date).** That is the row's unique key
 *   in Postgres and it is the entry's identity here, so a planned session and a
 *   row for the same day are the same thing and meet on the same map key. The
 *   date survives the most common schedule edit there is — somebody fixing the
 *   time of day — which keying by instant or by slot start would not.
 * - **Records beat the plan.** Where both exist the row wins outright,
 *   including its snapshotted start and end: a row was written about a session
 *   that ran at a particular hour, and an admin moving the club an hour later
 *   next term must not retroactively rewrite what happened last term. A row the
 *   plan no longer holds at all — a weekday move orphans one — still renders,
 *   for the same reason.
 * - **A cancellation replaces its date's entry — and beats a record too.** An
 *   admin's word that the session did not happen wins over anything stored
 *   for the date, which stays in the database and returns on a restore —
 *   including a record the plan no longer holds, which the document's
 *   cancellations still name. It applies only to a date the feed would
 *   otherwise show, so one with neither a planned session nor a row stays inert,
 *   and the cancelled entry keeps its dated place on whichever side of the
 *   present its end instant puts it.
 * - **Kind comes from dates, never from a column.** `now` against the session's
 *   *end* splits future from past, so a session in progress is the **current**
 *   one rather than history — the same rule the family feed uses, because the
 *   two are one timeline read by two audiences. That same end instant, together
 *   with the enforcement epoch, decides whether anything is owed. Editability is
 *   the one question that turns on the *start*: the register opens when the
 *   session begins, which is why roll call works mid-session, and the feed asks
 *   it directly rather than reading it off the kind. The plan begins at the
 *   product's start date, which is how far back the feed goes at all.
 *
 * A holiday break is the one entry that is not a session: the plan never held
 * its dates, so it arrives beside the plan rather than in it, and is drawn as
 * one line per break, in date order by the sessions it withdrew.
 *
 * Pure: no React, no network, no clock of its own. The caller passes `now`, so
 * SSR and the first client render agree and a test can stand anywhere in time.
 */

export interface GeduSessionFeedArgs {
  /** Half of every entry id, and the group whose rows these are. */
  groupId: string;
  /**
   * The product's planned sessions as the document carries them, soonest
   * first: from the start date to the end date on a dated product, and past
   * the shared horizon on an open-ended one.
   */
  plannedSessions: readonly PlannedSession[];
  /** The product has no end date, so its plan is cut to the shared horizon. */
  openEnded: boolean;
  /**
   * Every stored row for this group, in any order — the staff document's rows,
   * or the redacted rows a trainee is sent. Which of the two is decided by
   * {@link GeduSessionFeedArgs.reach}, never by inspecting a row: a date with no
   * row still has to know whether its note is empty or withheld.
   */
  sessions: readonly (GeduFeedSession | TraineeFeedSession)[];
  /**
   * The group's staff with their roles, exactly as either staff document emits
   * them — the first input the per-date staffing derivation takes.
   */
  gedus: readonly SessionStaffGedu[];
  /**
   * Every non-withdrawn substitution request on the group, any date, as either staff
   * document emits them. The whole array reaches every entry and the derivation
   * picks out the date it was asked about, which is what lets a planned date
   * with no stored row carry its requests like any other.
   */
  substitutions: readonly SubstitutionRequestDocument[];
  /**
   * The group's cancelled sessions, as either staff document emits them. The
   * detail fields are filled for an admin and null for a gedu, and ride through
   * to the entry unchanged.
   */
  cancellations: readonly SessionCancellation[];
  /**
   * The holiday breaks of the calendars the product follows, as every staff
   * document carries them. Each becomes one line where it withdrew a session
   * the feed would otherwise show, and none where it did not.
   */
  holidayBreaks: readonly HolidayBreak[];
  /**
   * The signed-in gedu, where the surface has one. `null` on the admin shell
   * and in the preview scenes, which is the honest answer rather than a guess:
   * it is what gates the "I can't make this session" action, so a wrong id
   * would offer one person's absence under another's name.
   */
  viewerId?: string | null;
  now: Date;
  /**
   * The product-local date from which write-ups are owed. Defaults to the
   * global constant; a test passes its own so it can stand either side of it.
   */
  epoch?: string;
  /**
   * Whose document the rows came from. `"staff"` (the default) is every staff
   * shell. `"redacted"` is the trainee's: every entry's gedu note is withheld —
   * on every date, stored row or not, because the reader may not learn whether
   * one was written — and **nothing is owed**, because what a session owes is
   * the staff's work and the redacted register is empty by construction; a
   * card counting it would flag every past session for marks that were made.
   */
  reach?: "staff" | "redacted";
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
    plannedSessions,
    openEnded,
    sessions,
    gedus,
    substitutions,
    cancellations,
    holidayBreaks,
    viewerId = null,
    now,
    epoch = SESSION_RECORDING_EPOCH,
    reach = "staff",
  } = args;

  // Mapped once for the whole feed rather than per entry: the derivation's
  // inputs are structural on purpose — it depends on no generated type — and
  // this is the one place either staff document's wire shape is turned into
  // them.
  const staffingGedus: StaffingAssignment[] = gedus.map((gedu) => ({
    id: gedu.id,
    firstName: gedu.first_name,
    role: gedu.role,
  }));
  const staffingRequests: SubstitutionRequestInput[] = substitutions.map(toSubstitutionRequestInput);

  /**
   * The planned sessions the feed shows, keyed by product-local date: every
   * one on a dated product, and on an open-ended one everything that has
   * started plus the next eight still open. A session stays open for the voice
   * room's closing margin after it ends, so one that has just finished is not
   * missing from the feed while its room is still up.
   */
  const shown = openEnded
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
  const cancellationsByDate = new Map(
    cancellations.map((cancellation) => [
      cancellation.session_date,
      cancellation,
    ]),
  );

  // A substitution request contributes no date of its own, deliberately. One filed
  // against a date the plan no longer holds and that nobody recorded against
  // has no instants to render with — an orphaned request is history, and the
  // admin queue is where it is cleared, because that list orders by date and
  // never by a derived instant.
  const dates = new Set([...planned.keys(), ...rowsByDate.keys()]);
  const entries: SessionFeedEntry[] = [];

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

    // The whole array goes in and the derivation picks its own date out — one
    // call per entry, and no second place that decides what "this date's
    // requests" means.
    const staffing = deriveSessionStaffing({
      gedus: staffingGedus,
      requests: staffingRequests,
      sessionDate: date,
      viewerId,
    });

    // A cancellation wins over a stored row on the same date. The record is
    // kept in the database and comes back on a restore, but the cancelled
    // entry carries none of it: the session did not happen, so there is
    // nothing on the card to read or edit.
    const cancellation = cancellationsByDate.get(date);
    if (cancellation !== undefined) {
      entries.push(
        toCancelledEntry({
          id: sessionEntryId(groupId, date),
          date,
          startsAt: when.startsAt,
          endsAt: when.endsAt,
          staffing,
          cancellation,
          now,
        }),
      );
      continue;
    }

    entries.push(
      toEntry({
        id: sessionEntryId(groupId, date),
        date,
        startsAt: when.startsAt,
        endsAt: when.endsAt,
        row,
        staffing,
        now,
        epoch,
        redacted: reach === "redacted",
      }),
    );
  }

  // A holiday break is one line, placed by the sessions it withdrew, and only
  // where at least one of them falls before the open-ended cut — the same
  // horizon the sessions stop at. Withdrawn sessions were never in the plan,
  // so they took no slot from the cap, and the line carries no staffing: a
  // date nobody planned has nobody to run it and nothing to substitute.
  const cut = cutStartsAt(plannedSessions, shown);
  const breaks = breaksInFeed(
    holidayBreaks,
    (session) => cut === null || session.startsAt.getTime() < cut.getTime(),
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
 * warning can never apply to it while the green check still can.
 *
 * A running session can never reach that branch whatever its date: it is
 * `future` now, and the epoch test sits below the end-based split.
 */
function toEntry(args: {
  id: string;
  date: string;
  startsAt: Date;
  endsAt: Date;
  row: GeduFeedSession | TraineeFeedSession | undefined;
  staffing: SessionStaffing;
  now: Date;
  epoch: string;
  redacted: boolean;
}): SessionFeedEntry {
  const { id, date, startsAt, endsAt, row, staffing, now, epoch, redacted } =
    args;
  const staffNote = redacted
    ? WITHHELD
    : row !== undefined && "gedu_note" in row
      ? row.gedu_note
      : null;

  if (endsAt.getTime() > now.getTime()) {
    return {
      kind: "future",
      id,
      startsAt,
      endsAt,
      staffing,
      report: row?.report ?? null,
      staffNote,
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
    return { kind: "no_record", id, startsAt, endsAt, staffing };
  }

  return {
    kind: "past",
    id,
    startsAt,
    endsAt,
    staffing,
    // No end test here any more: reaching this branch *is* having finished,
    // since the kind flips at the end instant a few lines up. The epoch is the
    // only remaining question, and it is the same one the SQL count asks.
    owed: withinEnforcement && !redacted,
    report: row?.report ?? null,
    staffNote,
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
 * One cancelled session, on the side of the present its end instant puts it —
 * the same instant every other kind is classified on.
 *
 * The staffing is carried because every entry carries it; a substitution
 * request filed before the cancellation is hidden rather than withdrawn, since
 * the card draws no staffing and a restore brings the request back as it was.
 */
function toCancelledEntry(args: {
  id: string;
  date: string;
  startsAt: Date;
  endsAt: Date;
  staffing: SessionStaffing;
  cancellation: SessionCancellation;
  now: Date;
}): SessionFeedEntry {
  const { id, date, startsAt, endsAt, staffing, cancellation, now } = args;
  return {
    kind: "cancelled",
    id,
    sessionDate: date,
    startsAt,
    endsAt,
    staffing,
    upcoming: endsAt.getTime() > now.getTime(),
    reason: cancellation.reason,
    cancelledAt:
      cancellation.cancelled_at === null
        ? null
        : new Date(cancellation.cancelled_at),
    // Both halves or nobody, exactly as the last editor is.
    cancelledBy:
      cancellation.cancelled_by !== null &&
      cancellation.cancelled_by_first_name !== null
        ? {
            id: cancellation.cancelled_by,
            firstName: cancellation.cancelled_by_first_name,
          }
        : null,
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
function toReportEmailedAt(
  row: GeduFeedSession | TraineeFeedSession | undefined,
): Date | null {
  const stamped = row?.report_emailed_at ?? null;
  return stamped === null ? null : new Date(stamped);
}

/**
 * One substitution request, from the shape the database emits into the shape the
 * derivation takes.
 *
 * The two differ only in casing and in nesting the two people into objects, and
 * that is the point: the derivation is written against structure rather than
 * against generated types, so it can be unit-tested and reasoned about without
 * a wire document anywhere near it. This function is the only place the two
 * meet.
 *
 * `is_requester` is carried across as `isMine` and is the fallback the
 * derivation uses when no viewer id is supplied — the document already answered
 * the question for the caller it was served to, and an explicit id, where the
 * surface has one, is the stronger answer and wins.
 */
export function toSubstitutionRequestInput(request: SubstitutionRequestDocument): SubstitutionRequestInput {
  return {
    id: request.id,
    sessionDate: request.session_date,
    requestedBy: {
      id: request.requested_by,
      firstName: request.requested_by_first_name,
    },
    role: request.role,
    status: request.status,
    substituteId:
      request.substitute_id === null || request.substitute_first_name === null
        ? null
        : {
            id: request.substitute_id,
            firstName: request.substitute_first_name,
          },
    offerCount: request.offer_count,
    isMine: request.is_requester,
  };
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
function toLastEditedBy(
  row: GeduFeedSession | TraineeFeedSession | undefined,
): SessionEditor | null {
  if (row === undefined) return null;
  return row.updated_by !== null && row.updated_by_first_name !== null
    ? { id: row.updated_by, firstName: row.updated_by_first_name }
    : null;
}
