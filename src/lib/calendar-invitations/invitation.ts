import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { SENDER_NAME } from "@/lib/constants";
import {
  CRLF,
  ICS_PRODID,
  escapeText,
  foldLine,
  formatUtcTimestamp,
  formatZonedTimestamp,
  paramValue,
  property,
  zoneBlock,
} from "./ics-primitives";

/**
 * One seat's whole schedule as a single calendar object.
 *
 * **One seat is one calendar object, and that is decided.** A message carries a
 * single `VEVENT` under a single `UID`, and that object states the product's
 * entire schedule — a camp on Monday, Wednesday and Friday for four weeks is
 * twelve sessions in one invitation, accepted in one gesture and withdrawn in
 * one. RFC 5546 gives an iTIP message one calendar object to describe, and a
 * client handed several reads the first and ignores the rest.
 *
 * **The two shapes are two notations for that one object**, not two ways of
 * splitting it up — which is what makes a shape safe to change between an
 * invitation and its update: the `UID` does not move, so the client applies the
 * new notation in place.
 *
 * **This module is pure.** It takes a plain description of a schedule and
 * returns a string; it reads no database, no request and no environment, and
 * the only thing it imports from the app is the brand name it files the entry
 * under. Everything a real send has to remember — the identifier, the revision
 * number, who it went to — is the caller's, because none of it can be derived
 * from a schedule.
 */

/** RFC 5545 `BYDAY` codes, indexed by the schema's 0=Monday weekday. */
const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

/**
 * How far ahead an explicit date list reaches.
 *
 * The list has to stop somewhere — an open-ended club has no last session to
 * enumerate — and twelve weeks is a term. It is measured from the run's first
 * remaining day rather than from today, so a camp six months out still lists
 * its own sessions rather than coming back empty.
 */
const LIST_HORIZON_DAYS = 84;

export type InvitationMethod = "request" | "publish" | "cancel";
export type InvitationShape = "rule" | "list";

export interface InvitationParty {
  name: string;
  email: string;
}

export interface InvitationInput {
  /** The object's identity, used verbatim — this is what makes an update land in place. */
  uid: string;
  /** The revision number. A later message about the same object states a higher one. */
  sequence: number;
  method: InvitationMethod;
  shape: InvitationShape;
  /** Weekdays the product runs on, `0` = Monday … `6` = Sunday, as `schedule_slots` numbers them. */
  weekdays: number[];
  /** `YYYY-MM-DD`, the run's first day, read as a date in `timezone`. */
  startDate: string;
  /** `YYYY-MM-DD`, the run's last day, or `null` for an open-ended run. */
  endDate: string | null;
  /** `HH:MM`, the wall clock every session starts at, in `timezone`. */
  startTime: string;
  durationMinutes: number;
  /** The IANA zone the schedule is authored in — a weekly slot promises a clock face, not an instant. */
  timezone: string;
  summary: string;
  description: string;
  /** The same content as HTML, for the clients that render `X-ALT-DESC`. */
  htmlDescription?: string;
  location: string | null;
  url: string | null;
  organizer: InvitationParty;
  /** `null` for a published entry, which asks nobody for an answer. */
  attendee: InvitationParty | null;
  reminderMinutes: number | null;
  /** The instant the message is being composed at: `DTSTAMP`, and the past/future cut. */
  now: Date;
}

export type InvitationResult =
  | { ok: true; ics: string; occurrenceCount: number }
  /**
   * A run with nothing left in it. A refusal rather than an empty document,
   * because an empty `VCALENDAR` says nothing to a client and sending one would
   * still open a conversation the recipient's calendar has no entry for — and
   * because the caller is the one that knows what to say about it.
   */
  | { ok: false; reason: "no-occurrences" };

/** A `YYYY-MM-DD` string as a UTC-pinned day. */
function parseDay(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** A UTC-pinned day back as `YYYY-MM-DD`. */
function dayString(utcDay: number): string {
  const date = new Date(utcDay);
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

/** `0` = Monday … `6` = Sunday, from a UTC-pinned day. */
function weekdayOf(utcDay: number): number {
  return (new Date(utcDay).getUTCDay() + 6) % 7;
}

/**
 * Every session still ahead of `now`, soonest first, within the list horizon.
 *
 * **The day walk is UTC-pinned and the conversion is the last step**, which is
 * the only shape that survives a DST transition inside a run: stepping a zoned
 * wall clock by 24 hours repeats or skips a calendar date once a year, and UTC
 * has no transitions for the arithmetic to fall into. Each day that lands on one
 * of the product's weekdays is turned into an instant by reading its wall clock
 * in the product's own zone, which is what the schedule actually promises.
 *
 * Both shapes walk this same list. A rule is not a different set of sessions,
 * it is a shorter way of writing this one — so only one expansion has to be
 * right, and the two notations cannot disagree about what the object covers.
 */
function occurrencesOf(input: InvitationInput): Date[] {
  const weekdays = new Set(input.weekdays);
  if (weekdays.size === 0) return [];

  const today = parseDay(formatInTimeZone(input.now, input.timezone, "yyyy-MM-dd"));
  const first = Math.max(parseDay(input.startDate), today);
  const horizon = first + LIST_HORIZON_DAYS * 86_400_000;
  const last =
    input.endDate === null ? horizon : Math.min(parseDay(input.endDate), horizon);

  const found: Date[] = [];
  for (let day = first; day <= last; day += 86_400_000) {
    if (!weekdays.has(weekdayOf(day))) continue;
    const instant = fromZonedTime(
      `${dayString(day)}T${input.startTime}:00`,
      input.timezone,
    );
    if (instant.getTime() < input.now.getTime()) continue;
    found.push(instant);
  }
  return found;
}

/**
 * An RFC 5545 duration, in whole minutes.
 *
 * Minutes rather than an hours-and-minutes split because there is nothing to
 * gain from the split — a parser reads `PT120M` and `PT2H` identically — and one
 * unit is one thing that can be wrong.
 */
function isoDuration(minutes: number): string {
  return `PT${minutes}M`;
}

/**
 * The schedule as a weekly rule.
 *
 * `BYDAY` names every weekday the product runs on, in RFC order, and `DTSTART`
 * is the first session still ahead — which may be mid-week, in which case the
 * rule's own first week is clipped by `DTSTART` exactly as RFC 5545 requires.
 * `UNTIL` is absent for an open-ended run: that is the one thing this shape can
 * say and an explicit list cannot, since a list stops at whatever horizon we
 * happened to enumerate. When there is an end date, `UNTIL` is the end of that
 * last *product-local* day expressed as an instant, because the run ends when
 * the day ends where the product is, not where the reader is.
 */
function ruleLines(input: InvitationInput, first: Date): string[] {
  const weekdays = [...new Set(input.weekdays)]
    .sort((a, b) => a - b)
    .map((weekday) => BYDAY[weekday]);
  const until =
    input.endDate === null
      ? ""
      : `;UNTIL=${formatUtcTimestamp(
          fromZonedTime(`${input.endDate}T23:59:59`, input.timezone),
        )}`;

  return [
    property(
      "DTSTART",
      formatZonedTimestamp(first, input.timezone),
      `;TZID=${input.timezone}`,
    ),
    property("DURATION", isoDuration(input.durationMinutes)),
    property("RRULE", `FREQ=WEEKLY;BYDAY=${weekdays.join(",")}${until}`),
  ];
}

/**
 * The schedule as an explicit list of dates.
 *
 * `DTSTART` is the first session and every *later* one is an `RDATE` — the
 * first is never repeated, because a client that reads it twice has two
 * sessions where there is one. Both are stated as local wall clocks in the
 * product's zone rather than as instants, so a DST transition inside the run
 * moves nothing.
 */
function listLines(input: InvitationInput, occurrences: readonly Date[]): string[] {
  const params = `;TZID=${input.timezone}`;
  const lines = [
    property(
      "DTSTART",
      formatZonedTimestamp(occurrences[0], input.timezone),
      params,
    ),
    property("DURATION", isoDuration(input.durationMinutes)),
  ];
  const rest = occurrences
    .slice(1)
    .map((instant) => formatZonedTimestamp(instant, input.timezone));
  if (rest.length > 0) lines.push(property("RDATE", rest.join(","), params));
  return lines;
}

/**
 * `ORGANIZER` / `ATTENDEE` — a property whose value is a URI and whose
 * parameters carry the name, so it is written whole rather than through
 * `property()`: that helper puts the parameters before a `:` and the value
 * after it, and here the value itself contains a `:`.
 */
function calendarUser(
  name: "ORGANIZER" | "ATTENDEE",
  party: InvitationParty,
  extraParams = "",
): string {
  return foldLine(
    `${name};CN=${paramValue(party.name)}${extraParams}:mailto:${party.email}`,
  );
}

const METHOD_NAMES: Record<InvitationMethod, string> = {
  request: "REQUEST",
  publish: "PUBLISH",
  cancel: "CANCEL",
};

function alarmLines(minutes: number, description: string): string[] {
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    property("TRIGGER", `-PT${minutes}M`),
    property("DESCRIPTION", escapeText(description)),
    "END:VALARM",
  ];
}

function eventLines(input: InvitationInput, schedule: readonly string[]): string[] {
  const cancelled = input.method === "cancel";
  const lines: string[] = [
    "BEGIN:VEVENT",
    property("UID", input.uid),
    property("DTSTAMP", formatUtcTimestamp(input.now)),
    `SEQUENCE:${input.sequence}`,
    ...schedule,
    property("SUMMARY", escapeText(input.summary)),
    property("DESCRIPTION", escapeText(input.description)),
  ];

  if (input.htmlDescription !== undefined) {
    lines.push(
      property(
        "X-ALT-DESC",
        escapeText(input.htmlDescription),
        ";FMTTYPE=text/html",
      ),
    );
  }
  if (input.location !== null) {
    lines.push(property("LOCATION", escapeText(input.location)));
  }
  // A URI, not TEXT: RFC 5545 §3.3.13 does not escape it, and escaping would
  // corrupt the query string of any link that carries one.
  if (input.url !== null) lines.push(property("URL", input.url));
  lines.push(property("CATEGORIES", escapeText(SENDER_NAME)));

  // Every method names an organizer — RFC 5546 requires one of a `PUBLISH` too,
  // and it is the wrong property to drop anyway, since it says who the entry
  // came from. The `ATTENDEE` is what carries RSVP semantics, so a published
  // entry leaves it off entirely: an object a reader adds to their calendar
  // with nobody asking them to answer.
  lines.push(calendarUser("ORGANIZER", input.organizer));
  if (input.attendee !== null) {
    // A withdrawal names the attendee whose invitation is being retracted — a
    // `CANCEL` with nobody on it is not addressed to anyone — but it does not
    // ask for an answer, so the RSVP parameters belong to the request alone.
    lines.push(
      calendarUser(
        "ATTENDEE",
        input.attendee,
        cancelled
          ? ";ROLE=REQ-PARTICIPANT"
          : ";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE",
      ),
    );
  }

  lines.push(`STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`);
  lines.push("TRANSP:TRANSPARENT");

  if (input.reminderMinutes !== null) {
    lines.push(...alarmLines(input.reminderMinutes, input.summary));
  }

  lines.push("END:VEVENT");
  return lines;
}

/**
 * Serialize the whole message, CRLF-terminated throughout.
 *
 * The `METHOD` is at the calendar level rather than on the event, which is what
 * makes the document an iTIP message rather than a calendar that happens to
 * contain one. Both shapes state their times as a wall clock in the product's
 * own zone, so the document always names a `TZID` and always owes the reader
 * either the transition rules for it or the note saying why it has none.
 */
export function buildInvitation(input: InvitationInput): InvitationResult {
  const occurrences = occurrencesOf(input);
  if (occurrences.length === 0) return { ok: false, reason: "no-occurrences" };

  const schedule =
    input.shape === "rule"
      ? ruleLines(input, occurrences[0])
      : listLines(input, occurrences);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    property("PRODID", ICS_PRODID),
    "CALSCALE:GREGORIAN",
    property("METHOD", METHOD_NAMES[input.method]),
    ...zoneBlock(input.timezone),
    ...eventLines(input, schedule),
    "END:VCALENDAR",
  ];

  return {
    ok: true,
    // A trailing CRLF as well: a content line is terminated by one, and the
    // last line of the document is not an exception.
    ics: `${lines.join(CRLF)}${CRLF}`,
    occurrenceCount: occurrences.length,
  };
}
