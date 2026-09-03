import type { SupportedLocale } from "@/lib/constants/locales";
import {
  buildCalendarFeedEvents,
  type CalendarFeedEvent,
  type FeedSeat,
} from "@/lib/calendar-feed/events";
import { CALENDAR_FEED_DEFAULTS } from "@/lib/calendar-feed/options";
import {
  ICS_PRODID,
  escapeText,
  foldLine,
  formatUtcTimestamp,
  formatZonedTimestamp,
} from "@/lib/calendar-feed/ics";
import type { CalendarFeedTranslator } from "@/lib/calendar-feed/translator";
import { SENDER_EMAIL, SENDER_NAME } from "@/lib/constants";
import { earlierBoundary, endDateToCutoff } from "@/lib/session-occurrence";
import {
  canStateAsRule,
  methodForMessage,
  reminderMinutes,
  type InvitationMethodOption,
  type InvitationReminder,
  type InvitationShape,
} from "./options";

/**
 * One participation as an iTIP calendar message.
 *
 * **One seat is one calendar object.** A message carries a single `VEVENT`
 * under a single `UID`, and that object states the product's *entire* schedule
 * — a camp on Monday, Wednesday and Friday for four weeks is twelve sessions in
 * one invitation, accepted in one gesture and cancelled in one. RFC 5546 gives
 * an iTIP message one calendar object to describe; a message stating several
 * was read by clients as its first component and nothing else. The two shapes
 * are two notations for that one object's schedule, not two ways of splitting
 * it up — which is also what makes the shape safe to change between an
 * invitation and its update, since the `UID` does not move.
 *
 * **Why this is not the feed writer.** A feed is a document a client polls and
 * takes wholesale; an invitation is a *message* addressed to somebody, and
 * three properties the feed has no use for are the whole of what makes it one:
 * `ORGANIZER` and `ATTENDEE` say who is asking whom, and `SEQUENCE` says which
 * revision this is. The shared writer's event type cannot express any of them —
 * nor `RDATE`, nor a `DURATION` in place of a `DTEND` — and that file is not
 * this change's to widen, so the serialisation here is a second, smaller writer
 * built out of the shared one's *exported* primitives. The escaping, the
 * octet-counted folding and both timestamp forms are imported, so the two
 * writers cannot disagree about the parts that are hard.
 *
 * What had to be copied rather than imported is the `Europe/Helsinki`
 * `VTIMEZONE` block and the sentence a document states about a zone it cannot
 * describe, both of which the shared writer holds privately. They are copied
 * verbatim below and marked; the right fix, when the feed module is next open
 * for editing, is to export them there and delete the copies.
 *
 * **The occurrence expansion is shared, not reimplemented.** The sessions this
 * message states come from the same walk the feed runs, over the same neutral
 * seat shape, so an invitation cannot describe a schedule the feed disagrees
 * with.
 */

const CRLF = "\r\n";

/** RFC 5545 `BYDAY` codes, indexed by the schema's 0=Monday weekday. */
const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

/** The zone the copied `VTIMEZONE` describes. Every product we run is in it. */
const KNOWN_TIMEZONE = "Europe/Helsinki";

/**
 * What a document says about a zone it states but cannot describe.
 *
 * Worded and emitted exactly as the feed writer does, and for the same reason:
 * a `TZID` naming a zone the document carries no transition rules for is legal
 * and every mainstream client resolves it out of its own database, but a
 * document that says nothing about the gap reads as one that has no gap. The
 * sandbox offers four zones and this exploration ships rules for one of them.
 */
function unknownZoneNote(zone: string): string {
  return `No VTIMEZONE is emitted for ${zone}: this exploration ships transition rules for ${KNOWN_TIMEZONE} only, so the TZID reference relies on the client's own timezone database.`;
}

/**
 * Copied verbatim from the feed's `.ics` writer, which holds it privately.
 *
 * `Europe/Helsinki` under the EU rule: EET (+02:00) in winter, EEST (+03:00)
 * from the last Sunday of March to the last Sunday of October. If this ever
 * disagrees with the copy in the feed writer, the feed writer is right — and
 * the disagreement is the reason to export it from there and delete this.
 */
const HELSINKI_VTIMEZONE: readonly string[] = [
  "BEGIN:VTIMEZONE",
  `TZID:${KNOWN_TIMEZONE}`,
  `X-LIC-LOCATION:${KNOWN_TIMEZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0300",
  "TZNAME:EEST",
  "DTSTART:19700329T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0300",
  "TZOFFSETTO:+0200",
  "TZNAME:EET",
  "DTSTART:19701025T040000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function property(name: string, value: string, params = ""): string {
  return foldLine(`${name}${params}:${value}`);
}

/**
 * A parameter value, quoted when RFC 5545 §3.1 requires it.
 *
 * A param value carrying `:`, `;` or `,` has to be a quoted-string, and a
 * quoted-string cannot contain a DQUOTE at all — there is no escape for one —
 * so a double quote in a name is dropped rather than smuggled through. This is
 * the one place a name reaches the document *outside* a TEXT value, which is
 * why `escapeText` is not the answer here.
 */
function paramValue(value: string): string {
  const cleaned = value.replace(/["\r\n]/g, "");
  return /[:;,]/.test(cleaned) ? `"${cleaned}"` : cleaned;
}

/**
 * `ORGANIZER` / `ATTENDEE` — a property whose value is a URI and whose
 * parameters carry the name, so it is written whole rather than through
 * `property()`: that helper puts the parameters before a `:` and the value
 * after it, and here the value itself contains a `:`.
 */
function calendarUser(
  propertyName: "ORGANIZER" | "ATTENDEE",
  displayName: string,
  email: string,
  extraParams = "",
): string {
  return foldLine(
    `${propertyName};CN=${paramValue(displayName)}${extraParams}:mailto:${email}`,
  );
}

export interface InvitationAttendee {
  /** The parent's first name, as the `CN` a client shows beside the RSVP. */
  name: string;
  email: string;
}

export interface BuildInvitationArgs {
  /** The seat the message is about, in the pipeline's neutral shape. */
  seat: FeedSeat;
  /** The stored `UID` — the object's identity, used verbatim. */
  baseUid: string;
  sequence: number;
  /** Which of the two mail experiences this conversation is running as. */
  experience: InvitationMethodOption;
  /**
   * Whether this message withdraws the object rather than stating it.
   *
   * Carried beside the experience rather than folded into a `METHOD`, because
   * the two only coincide for a `REQUEST`: RFC 5546 withdraws a *published*
   * object by re-stating it as a `PUBLISH` carrying `STATUS:CANCELLED`, since a
   * `CANCEL` names the `ATTENDEE` whose invitation is being retracted and a
   * published object never carried one. The `METHOD` is derived from the pair,
   * so no caller can state a withdrawal the status line disagrees with.
   */
  cancelling: boolean;
  shape: InvitationShape;
  reminder: InvitationReminder;
  attendee: InvitationAttendee;
  translate: CalendarFeedTranslator;
  locale: SupportedLocale;
  now: Date;
}

/**
 * The sessions this message states: every occurrence still ahead of `now`,
 * soonest first, each of them once.
 *
 * **Deduplicated across the whole seat, on the (start, end) instant pair.** The
 * shared expansion walks one slot at a time and dedupes only within a slot, so a
 * product carrying the same slot twice — one press of the sandbox editor's "Add
 * slot" — hands back two events at one instant. One session is one session, and
 * a duplicate corrupts everything downstream of this list: the first
 * occurrence's own stamp reappears as an `RDATE` beside the `DTSTART` it already
 * is, every later date is listed twice, and the count the caller refuses on is
 * doubled. Both instants are keyed rather than the start alone, because two
 * slots that begin together and run for different lengths are not one session
 * and collapsing them would silently drop the longer one.
 *
 * **Always the discrete walk, whichever shape is asked for.** A rule is not a
 * different set of sessions, it is a shorter way of writing this one — so both
 * shapes agree about which sessions the object covers, and only one expansion
 * has to be right. Filtering to what is still ahead is what an invitation adds
 * over a subscription: the feed deliberately carries a week of look-back so the
 * current week reads complete, and inviting somebody to a session that already
 * happened would put an RSVP prompt on it.
 *
 * The feed options are fixed rather than exposed, because they are not what is
 * being compared here: the feed card already offers every one of them, and an
 * invitation adds its own three questions (shape, reminder, RSVP-or-not) on top
 * of a schedule that has to stay recognisable between a send and its update.
 * `details: "basic"` gives the description its gamer and type lines and no
 * link, which is why no origin is needed; the scope is the whole family because
 * the seat handed in is already the only one.
 */
function futureOccurrences(args: BuildInvitationArgs): CalendarFeedEvent[] {
  const events = buildCalendarFeedEvents({
    seats: [args.seat],
    options: { ...CALENDAR_FEED_DEFAULTS, mode: "discrete" },
    translate: args.translate,
    locale: args.locale,
    // Unused: `details: "basic"` emits no `URL`, so nothing here is absolute.
    origin: "",
    now: args.now,
  });

  const seen = new Set<string>();
  const ahead: CalendarFeedEvent[] = [];
  for (const event of events) {
    if (event.start.getTime() < args.now.getTime()) continue;
    const key = `${event.start.getTime()}/${event.end.getTime()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ahead.push(event);
  }
  return ahead;
}

/**
 * An RFC 5545 duration, in whole minutes.
 *
 * Minutes rather than an hours-and-minutes split because there is nothing to
 * gain from the split — a parser reads `PT300M` and `PT5H` identically — and
 * one unit is one thing that can be wrong. Slot durations are whole minutes by
 * schema, so the rounding never bites; it is there because the value arrives as
 * a difference between two instants.
 */
function isoDuration(milliseconds: number): string {
  return `PT${Math.round(milliseconds / 60_000)}M`;
}

/** How long an occurrence runs, in milliseconds. */
function durationOf(event: CalendarFeedEvent): number {
  return event.end.getTime() - event.start.getTime();
}

/**
 * The instant the run stops, or `null` for an open-ended one.
 *
 * A cancelling subscription's paid-through instant bounds the rule exactly as a
 * product's own end date does — a family winding down should not be invited to
 * sessions past what they paid for — so `UNTIL` takes the earlier of the two,
 * which is the same clamp the shared expansion applies to the explicit list.
 */
function runEndOf(seat: FeedSeat): Date | null {
  return earlierBoundary(
    endDateToCutoff(seat.endDate, seat.timezone),
    seat.cancelsAt,
  );
}

/**
 * The schedule as a weekly rule.
 *
 * `BYDAY` names every weekday the product runs on, in RFC order, and `DTSTART`
 * is the first session still ahead — which may be mid-week, in which case the
 * rule's own first week is clipped by `DTSTART` exactly as RFC 5545 requires
 * and nothing before it is generated. `UNTIL` is absent for an open-ended run:
 * that is the one thing this shape can say and the explicit list cannot, since
 * a list stops at the horizon we happened to enumerate.
 *
 * The caller has already established that a rule can state this schedule at
 * all; `BYDAY` is deduplicated because two slots on one weekday can only reach
 * here by being the same clock face, which is one rule day, not two.
 */
function ruleLines(args: BuildInvitationArgs, first: CalendarFeedEvent): string[] {
  const weekdays = [...new Set(args.seat.slots.map((slot) => slot.weekday))]
    .sort((a, b) => a - b)
    .map((weekday) => BYDAY[weekday]);
  const runEnd = runEndOf(args.seat);

  return [
    property(
      "DTSTART",
      formatZonedTimestamp(first.start, first.timezone),
      `;TZID=${first.timezone}`,
    ),
    property("DURATION", isoDuration(durationOf(first))),
    property(
      "RRULE",
      `FREQ=WEEKLY;BYDAY=${weekdays.join(",")}` +
        (runEnd === null ? "" : `;UNTIL=${formatUtcTimestamp(runEnd)}`),
    ),
  ];
}

/** What an explicit date list had to reach for to state this schedule. */
interface ExplicitList {
  lines: string[];
  /** Whether any occurrence had to be written as an `RDATE;VALUE=PERIOD`. */
  usesPeriodRdates: boolean;
}

/**
 * The schedule as an explicit list of dates.
 *
 * `DTSTART` is the first session still ahead and every later one is an `RDATE`
 * in the product's own zone, as a local wall clock rather than an instant: the
 * list has to survive a DST transition inside the run, and a wall clock is what
 * the schedule actually promises. Differing *start times* across slots cost
 * nothing here — that is this shape's whole advantage over a rule.
 *
 * Differing **lengths** are the one thing the format handles badly. RFC 5545
 * §3.8.5.2 lets `RDATE` properties carry different value types, so an
 * occurrence whose length is not the `DURATION` is written as a period —
 * `<start>/<duration>` — and only those are; every occurrence that matches the
 * base duration stays in the plain date-time list, so a client that ignores
 * period entries still receives all of those rather than none of them. Client
 * support for periods is weak, which is what `usesPeriodRdates` exists to warn
 * about rather than to hide.
 */
function explicitListLines(
  first: CalendarFeedEvent,
  rest: readonly CalendarFeedEvent[],
): ExplicitList {
  const zone = first.timezone;
  const params = `;TZID=${zone}`;
  const baseDuration = durationOf(first);

  const plain: string[] = [];
  const periods: string[] = [];
  for (const event of rest) {
    const stamp = formatZonedTimestamp(event.start, zone);
    if (durationOf(event) === baseDuration) {
      plain.push(stamp);
      continue;
    }
    periods.push(`${stamp}/${isoDuration(durationOf(event))}`);
  }

  const lines = [
    property("DTSTART", formatZonedTimestamp(first.start, zone), params),
    property("DURATION", isoDuration(baseDuration)),
  ];
  if (plain.length > 0) lines.push(property("RDATE", plain.join(","), params));
  if (periods.length > 0) {
    lines.push(property("RDATE", periods.join(","), `;VALUE=PERIOD${params}`));
  }

  return { lines, usesPeriodRdates: periods.length > 0 };
}

function alarmLines(minutes: number, description: string): string[] {
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    property("TRIGGER", `-PT${minutes}M`),
    property("DESCRIPTION", escapeText(description)),
    "END:VALARM",
  ];
}

/**
 * The one `VEVENT`, whichever notation states its schedule.
 *
 * Everything outside the schedule lines is read off the first occurrence,
 * because the summary, the description and the location are properties of the
 * seat rather than of a session: the expansion writes the same three onto every
 * occurrence it produces for one seat.
 */
function eventLines(
  args: BuildInvitationArgs,
  first: CalendarFeedEvent,
  schedule: readonly string[],
  dtstamp: Date,
): string[] {
  const cancelled = args.cancelling;

  // An invitation is an appointment somebody is being asked to keep, so it
  // occupies the time. The feed offers free-versus-busy as a knob because a
  // subscribed calendar of somebody else's children is arguably neither.
  const lines: string[] = [
    "BEGIN:VEVENT",
    property("UID", args.baseUid),
    property("DTSTAMP", formatUtcTimestamp(dtstamp)),
    `SEQUENCE:${args.sequence}`,
    ...schedule,
    property("SUMMARY", escapeText(first.summary)),
  ];

  if (first.description !== null) {
    lines.push(property("DESCRIPTION", escapeText(first.description)));
  }
  if (first.location !== null) {
    lines.push(property("LOCATION", escapeText(first.location)));
  }

  // Every method names an organizer: RFC 5546 requires one of a `PUBLISH` too,
  // and it is the wrong property to drop anyway — it says who the entry came
  // from, which a reader wants whether or not they are being asked anything.
  // The `ATTENDEE` is what carries RSVP semantics, so that is the one the
  // publish experience leaves off: an object a reader adds to their calendar
  // with nobody asking them to answer. It stays off when that object is being
  // withdrawn, too — naming an attendee only in the message that retracts an
  // invitation nobody was sent is worse than naming none at all — which is why
  // a published thread is withdrawn as a `PUBLISH` and not as a `CANCEL`.
  lines.push(calendarUser("ORGANIZER", SENDER_NAME, SENDER_EMAIL));
  if (args.experience === "request") {
    lines.push(
      calendarUser(
        "ATTENDEE",
        args.attendee.name,
        args.attendee.email,
        ";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE",
      ),
    );
  }

  lines.push(`STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`);
  lines.push("TRANSP:OPAQUE");

  const minutes = reminderMinutes(args.reminder);
  // A cancellation carries no alarm: the event is being withdrawn, and a
  // reminder attached to it is a notification about something that is not
  // happening. One alarm on one object fires before each of its occurrences,
  // which is what the offsets have always meant.
  if (minutes !== null && !cancelled) {
    lines.push(...alarmLines(minutes, first.summary));
  }

  lines.push("END:VEVENT");
  return lines;
}

export interface InvitationCalendar {
  /** The serialized document, exactly as the recipient receives it. */
  ics: string;
  /**
   * How many sessions the one object covers.
   *
   * Returned beside the document rather than counted back out of it, because a
   * message covering no sessions at all is one the caller has to refuse before
   * it mails anything: an empty `VCALENDAR` says nothing to a client, and
   * sending one would still open a conversation the recipient's calendar has no
   * entry for.
   *
   * It counts the occurrences the shared expansion found **inside its horizon**,
   * which is what the refusal needs and is not a claim about a rule's reach: an
   * open-ended club stated as a rule covers sessions forever, and this number
   * only says the run has not already finished.
   */
  occurrenceCount: number;
  /**
   * Whether the schedule needed `RDATE;VALUE=PERIOD` entries to state at all.
   *
   * Surfaced rather than absorbed because client support for period entries is
   * weak, and the admin comparing clients is the person who needs to know that
   * this particular document is exercising it.
   */
  usesPeriodRdates: boolean;
}

/**
 * A built message, or the one schedule this builder can refuse to state.
 *
 * A refusal rather than a thrown error, and rather than a silent fall back to
 * the other shape: which shape was asked for is part of what the admin is
 * comparing, so quietly sending the other one would answer a question they did
 * not ask. The caller is the one that knows what status code "a rule cannot say
 * this" deserves.
 */
export type InvitationBuildResult =
  | { ok: true; calendar: InvitationCalendar }
  | { ok: false; reason: "rule-cannot-express-schedule" };

/**
 * Serialize the whole message, CRLF-terminated throughout.
 *
 * The `METHOD` is at the calendar level rather than per event, which is what
 * makes the document an iTIP message rather than a calendar that happens to
 * contain events — and it has to agree with how the mail part is typed, which
 * is why both ends derive it from the experience and the withdrawal flag
 * through the one shared function rather than each choosing a value.
 *
 * Both shapes state their times as a wall clock in the product's own zone, so
 * the document always names a `TZID` and always owes the reader either the
 * transition rules for it or a note saying why it has none.
 */
export function buildInvitationCalendar(
  args: BuildInvitationArgs,
): InvitationBuildResult {
  const occurrences = futureOccurrences(args);

  // Checked before the shape is: a seat whose run is already over cannot be
  // stated in *either* notation, and "there is nothing left to invite anybody
  // to" is the more accurate thing to tell the admin than "a rule cannot say
  // this". Guarded on the length rather than on the element, because indexed
  // access is typed as always-present here.
  if (occurrences.length === 0) {
    return {
      ok: true,
      calendar: {
        ics: emptyCalendar(args),
        occurrenceCount: 0,
        usesPeriodRdates: false,
      },
    };
  }

  if (args.shape === "series" && !canStateAsRule(args.seat.slots)) {
    return { ok: false, reason: "rule-cannot-express-schedule" };
  }

  const first = occurrences[0];
  const explicit =
    args.shape === "series" ? null : explicitListLines(first, occurrences.slice(1));
  const schedule = explicit === null ? ruleLines(args, first) : explicit.lines;

  const lines = [
    ...preambleLines(args),
    ...zoneLines(first.timezone),
    ...eventLines(args, first, schedule, args.now),
    "END:VCALENDAR",
  ];

  return {
    ok: true,
    calendar: {
      ics: `${lines.join(CRLF)}${CRLF}`,
      occurrenceCount: occurrences.length,
      usesPeriodRdates: explicit?.usesPeriodRdates ?? false,
    },
  };
}

function preambleLines(args: BuildInvitationArgs): string[] {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    property("PRODID", ICS_PRODID),
    "CALSCALE:GREGORIAN",
    property("METHOD", methodForMessage(args.experience, args.cancelling)),
  ];
}

/** The `VTIMEZONE` for the one zone this writer describes, or the note. */
function zoneLines(zone: string): string[] {
  if (zone !== KNOWN_TIMEZONE) {
    return [property("X-SOGVERSE-NOTE", escapeText(unknownZoneNote(zone)))];
  }
  return [...HELSINKI_VTIMEZONE];
}

/**
 * The document a seat with nothing ahead of it produces.
 *
 * It carries no zone block either: there is no `TZID` in it to describe.
 * Serialized rather than skipped so the caller's refusal has the same shape as
 * every other answer.
 */
function emptyCalendar(args: BuildInvitationArgs): string {
  return `${[...preambleLines(args), "END:VCALENDAR"].join(CRLF)}${CRLF}`;
}
