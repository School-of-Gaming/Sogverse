import { fromZonedTime } from "date-fns-tz";
import {
  CRLF,
  ICS_PRODID,
  escapeText,
  foldLine,
  formatUtcTimestamp,
  isUtcZone,
  paramValue,
  property,
  zoneBlock,
} from "./ics-primitives";

/**
 * One calendar object, with a knob for every property worth exploring.
 *
 * **This is an explorer of the format, not a description of a product.** The
 * question it exists to answer is what Google Calendar, Apple Calendar and
 * Outlook actually *do* with each property — which ones they render, which they
 * ignore, which they quietly rewrite — and the only way to find out is to send
 * one invitation that differs from the last one in exactly one place. So the
 * input mirrors RFC 5545 and RFC 5546 rather than mirroring a seat: nothing
 * here knows what a club is, and nothing here composes a sentence.
 *
 * **A property is a knob only if all three of those clients honour it.** The
 * three are the whole audience, and a field one of them drops on the floor
 * teaches nothing but its own absence — worse, it makes a send ambiguous,
 * because a difference that fails to appear could be the client or could be the
 * property never having been supported. `X-ALT-DESC`, `GEO`, `CATEGORIES`,
 * `PRIORITY`, `CLASS`, `X-MICROSOFT-CDO-BUSYSTATUS`, the RFC 7986 additions
 * (`CONFERENCE`, `COLOR`, `IMAGE`, `ATTACH`) and the explicit `RDATE` list were
 * all written here and all removed for exactly that reason. Adding one back is
 * a decision about the audience, not a tidy-up.
 *
 * **One UID, and every `VEVENT` in the document is under it.** An iTIP message
 * describes a single calendar object, and a client handed *several objects*
 * reads the first and ignores the rest — so the identifier never varies, and it
 * is used verbatim, which is what lets a later message land on the entry an
 * earlier one created. What may vary is how many components state that one
 * object: the master event, plus one per overridden occurrence, each carrying a
 * `RECURRENCE-ID` naming the occurrence it replaces. That is RFC 5545's own
 * shape for "this one is different", not a second object.
 *
 * **Every field either emits its property or omits it, and nothing else.** A
 * blank value is an absence rather than an empty property, because "what does
 * this client do when the property is missing" is half of what is being
 * explored. No field is derived from another, no default is invented here, and
 * no value is composed — the caller resolves the strings a form gave it and
 * hands over a plain object.
 *
 * **The module is pure.** It reads no database, no request and no environment;
 * `now` is an argument, because a `DTSTAMP` read off the wall clock is the one
 * input that would make every test true only on the day it was written.
 */

/** RFC 5545 `BYDAY` codes, indexed by `0` = Monday. */
const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

const DAY_MS = 86_400_000;

export type InvitationMethod = "request" | "publish" | "cancel";
export type InvitationStatus = "confirmed" | "tentative" | "cancelled";

/**
 * How a time of day is written down.
 *
 * A wall clock under a `TZID` promises a clock face and survives a daylight
 * saving transition; a `…Z` instant promises a moment and does not. Which of
 * the two a client honours — and what it shows a reader in another zone — is
 * one of the things worth watching, so it is a knob rather than a consequence.
 */
export type InvitationTimeForm = "tzid" | "utc";

/** Whether the entry blocks the reader's own time (`TRANSP`). */
export type InvitationShowAs = "free" | "busy";

export type InvitationRole = "REQ-PARTICIPANT" | "OPT-PARTICIPANT" | "NON-PARTICIPANT";
export type InvitationPartstat = "NEEDS-ACTION" | "ACCEPTED" | "TENTATIVE" | "DECLINED";
export type InvitationAlarmAction = "display" | "email" | "audio";
/** Whether an alarm counts back from the start of the event or from its end. */
export type InvitationAlarmAnchor = "start" | "end";

export interface InvitationParty {
  name: string;
  email: string;
}

export interface InvitationAttendee extends InvitationParty {
  role: InvitationRole;
  partstat: InvitationPartstat;
  /** Whether the message asks for an answer. */
  rsvp: boolean;
}

export interface InvitationAlarm {
  /** Minutes before the anchor. `0` fires on it. */
  minutesBefore: number;
  action: InvitationAlarmAction;
  anchor: InvitationAlarmAnchor;
}

/** A wall clock in the document's own zone: `YYYY-MM-DD` and `HH:MM`. */
export interface InvitationDateTime {
  date: string;
  time: string;
}

/**
 * One occurrence of the rule that happens at a different time from the rest.
 *
 * **This is what a mixed-time product needs, and what a single moved session
 * needs, and they are the same mechanism.** A club that runs Monday at 16:00
 * and Wednesday at 14:00 cannot be one `RRULE` — a rule states one clock face —
 * and neither can a term whose one week moved an hour later. RFC 5545 answers
 * both the same way: the rule states the ordinary case, and each exception is
 * its own `VEVENT` under the same `UID`, naming the occurrence it replaces with
 * a `RECURRENCE-ID`.
 */
export interface InvitationOverride {
  /** `YYYY-MM-DD`, the day of the occurrence being replaced. */
  date: string;
  /** `HH:MM`, the clock face it happens at instead. */
  time: string;
  /** The duration it runs for instead, or `null` to keep the master's. */
  durationMinutes: number | null;
}

/**
 * The two shapes a calendar object's schedule can take.
 *
 * `none` is a single occurrence and is the baseline every other setting is
 * compared against. `weekly` is the compact notation, and it is the only
 * recurrence here: an explicit `RDATE` list was the third shape and was dropped
 * because Outlook handles it poorly, which makes every send that used it
 * ambiguous between a client's fault and the notation's.
 */
export type InvitationRecurrence =
  | { kind: "none" }
  | {
      kind: "weekly";
      /** `0` = Monday … `6` = Sunday. Written in RFC order, deduplicated. */
      weekdays: number[];
      /** `INTERVAL`, in weeks. */
      interval: number;
      /** `YYYY-MM-DD`, or `null` for a rule with no last day. */
      until: string | null;
      /** `COUNT`. Wins over `until` when both are given, as RFC 5545 forbids both. */
      count: number | null;
    };

export interface InvitationInput {
  /** The object's identity, used verbatim — this is what makes an update land in place. */
  uid: string;
  /** The revision number. A later message about the same object states a higher one. */
  sequence: number;
  method: InvitationMethod;
  status: InvitationStatus;

  /** The IANA zone the wall clocks below are read in. */
  timezone: string;
  timeForm: InvitationTimeForm;
  /** A DATE-valued event: no clock face, no zone, `DTEND` on the following day. */
  allDay: boolean;
  start: InvitationDateTime;
  /** Ignored for an all-day event, which states a `DTEND` instead of a duration. */
  durationMinutes: number;
  recurrence: InvitationRecurrence;
  /** `YYYY-MM-DD` per entry; each becomes an `EXDATE` at the start time. */
  excludedDates: string[];
  /**
   * Occurrences that happen at another time, each an extra `VEVENT` under the
   * same `UID`. Only the weekly rule has occurrences to override, so this is
   * ignored for a single event.
   */
  overrides: InvitationOverride[];

  organizer: InvitationParty;
  /** `null` states no `ATTENDEE` at all — which is what a `PUBLISH` normally does. */
  attendee: InvitationAttendee | null;

  summary: string;
  /** Blank omits `DESCRIPTION`. */
  description: string;
  /** Blank omits the property. */
  location: string;
  /** Blank omits `URL`. */
  url: string;

  alarms: InvitationAlarm[];
  /** Who an `ACTION:EMAIL` alarm is addressed to. An email alarm without one is invalid. */
  alarmEmail: string;

  showAs: InvitationShowAs;

  /** The instant the message is composed at: `DTSTAMP`. */
  now: Date;
}

export type InvitationResult =
  | {
      ok: true;
      ics: string;
      /**
       * How many occurrences the document states, or `null` where it states an
       * unbounded run — a weekly rule with neither `UNTIL` nor `COUNT` covers a
       * number no document can name.
       */
      occurrenceCount: number | null;
    }
  /**
   * An object with nothing in it. A refusal rather than an empty document,
   * because a calendar describing no occurrence says nothing to a client and
   * sending one would still open a conversation the recipient's calendar has no
   * entry for — and because the caller is the one that knows what to say about
   * it.
   */
  | { ok: false; reason: "no-occurrences" };

// --- Dates, UTC-pinned throughout ---

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

/** The Monday of the week a day falls in, UTC-pinned. */
function weekStartOf(utcDay: number): number {
  return utcDay - weekdayOf(utcDay) * DAY_MS;
}

/** `YYYYMMDD` — the compact DATE form. */
function compactDate(date: string): string {
  return date.replace(/-/g, "");
}

/** `YYYYMMDDTHHMMSS` — the compact local DATE-TIME form, written as typed. */
function compactDateTime({ date, time }: InvitationDateTime): string {
  return `${compactDate(date)}T${time.replace(":", "")}00`;
}

/** A wall clock in a zone as an absolute instant. */
function instantOf({ date, time }: InvitationDateTime, zone: string): Date {
  return fromZonedTime(`${date}T${time}:00`, zone);
}

// --- How a time is written ---

/**
 * Whether times are written as absolute instants.
 *
 * The caller's answer, except in UTC, where it is the only answer: a zone with
 * no transitions has no clock face to promise, and `TZID=UTC` beside a `…Z`
 * timestamp is redundant on a forgiving reader and contradictory on a strict
 * one.
 */
function writesInstants(input: InvitationInput): boolean {
  return !input.allDay && (input.timeForm === "utc" || isUtcZone(input.timezone));
}

/** Whether any property in the document references the zone by name. */
function writesTzid(input: InvitationInput): boolean {
  return !input.allDay && !writesInstants(input);
}

/** The parameters that qualify every schedule timestamp in the document. */
function timeParams(input: InvitationInput): string {
  if (input.allDay) return ";VALUE=DATE";
  return writesInstants(input) ? "" : `;TZID=${input.timezone}`;
}

/** One schedule timestamp, in whichever of the three forms the document uses. */
function timeValue(input: InvitationInput, when: InvitationDateTime): string {
  if (input.allDay) return compactDate(when.date);
  return writesInstants(input)
    ? formatUtcTimestamp(instantOf(when, input.timezone))
    : compactDateTime(when);
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

// --- The schedule ---

/**
 * `UNTIL`, in the form the value type forces.
 *
 * RFC 5545 §3.3.10 is strict about this and clients are strict with it: a
 * DATE-valued `DTSTART` takes a DATE `UNTIL`, and a local `DTSTART` under a
 * `TZID` takes a UTC one — never a local time. The instant is the end of the
 * last day *in the document's own zone*, because a run ends when that day ends
 * where the event is.
 */
function untilValue(input: InvitationInput, until: string): string {
  if (input.allDay) return compactDate(until);
  return formatUtcTimestamp(
    fromZonedTime(`${until}T23:59:59`, isUtcZone(input.timezone) ? "UTC" : input.timezone),
  );
}

/** The `RRULE` value for a weekly rule. */
function weeklyRule(
  input: InvitationInput,
  recurrence: Extract<InvitationRecurrence, { kind: "weekly" }>,
): string {
  const weekdays = [...new Set(recurrence.weekdays)]
    .sort((a, b) => a - b)
    .map((weekday) => BYDAY[weekday]);
  const parts = [`FREQ=WEEKLY`, `BYDAY=${weekdays.join(",")}`];
  if (recurrence.interval !== 1) parts.push(`INTERVAL=${recurrence.interval}`);
  // RFC 5545 forbids stating both, so one has to win, and the count is the more
  // specific of the two — a reader who typed a number of occurrences meant that
  // number, whatever date they left in the other field.
  if (recurrence.count !== null) parts.push(`COUNT=${recurrence.count}`);
  else if (recurrence.until !== null) parts.push(`UNTIL=${untilValue(input, recurrence.until)}`);
  return parts.join(";");
}

/**
 * The lines that state when the object happens.
 *
 * `DTSTART` is exactly what the caller typed — never the next occurrence still
 * ahead, because an explorer that quietly moved the date would be answering a
 * question nobody asked. A timed event states a `DURATION`; an all-day event
 * states a `DTEND` on the following day, which is what a DATE-valued end means.
 */
function scheduleLines(input: InvitationInput): string[] {
  const params = timeParams(input);
  const lines = [property("DTSTART", timeValue(input, input.start), params)];

  if (input.allDay) {
    lines.push(
      property("DTEND", compactDate(dayString(parseDay(input.start.date) + DAY_MS)), params),
    );
  } else {
    lines.push(property("DURATION", isoDuration(input.durationMinutes)));
  }

  if (input.recurrence.kind === "weekly") {
    lines.push(property("RRULE", weeklyRule(input, input.recurrence)));
  }

  if (input.excludedDates.length > 0) {
    lines.push(
      property(
        "EXDATE",
        input.excludedDates
          .map((date) => timeValue(input, { date, time: input.start.time }))
          .join(","),
        params,
      ),
    );
  }

  return lines;
}

/**
 * How many occurrences the document states.
 *
 * **`DTSTART` is an occurrence in its own right** — RFC 5545 makes it the first
 * instance whether or not it satisfies the rule beside it — so it is counted
 * once, and removed again only by an `EXDATE` that names its day.
 *
 * `null` where no number exists: a weekly rule with no `UNTIL` and no `COUNT`
 * runs forever, which is the one thing that shape can say and an enumeration
 * cannot. A `COUNT` is reported as given, because that is precisely what it
 * asks the client for. Zero is what the caller refuses on.
 */
function occurrenceCountOf(input: InvitationInput): number | null {
  const excluded = new Set(input.excludedDates);
  const startCounts = excluded.has(input.start.date) ? 0 : 1;

  if (input.recurrence.kind === "none") return startCounts;

  const { weekdays, interval, until, count } = input.recurrence;
  if (count !== null) return count;
  if (until === null) return null;

  const weekdaySet = new Set(weekdays);
  const first = parseDay(input.start.date);
  const last = parseDay(until);
  const firstWeek = weekStartOf(first);
  let found = 0;
  // The day walk is UTC-pinned, which is the only shape that survives a
  // daylight-saving transition inside the run: stepping a zoned wall clock by
  // 24 hours repeats or skips a calendar date once a year, and UTC has no
  // transitions for the arithmetic to fall into.
  for (let day = first; day <= last; day += DAY_MS) {
    if (!weekdaySet.has(weekdayOf(day))) continue;
    if (((weekStartOf(day) - firstWeek) / (7 * DAY_MS)) % interval !== 0) continue;
    if (excluded.has(dayString(day))) continue;
    found += 1;
  }
  // The walk starts at `DTSTART`'s own day, so a start that satisfies the rule
  // is already in the total; one that does not is the instance RFC 5545 adds on
  // top of the rule, and it is added here for the same reason.
  return weekdaySet.has(weekdayOf(first)) ? found : found + startCounts;
}

// --- The people ---

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

// --- The alarms ---

const ALARM_ACTIONS: Record<InvitationAlarmAction, string> = {
  display: "DISPLAY",
  email: "EMAIL",
  audio: "AUDIO",
};

/**
 * The alarms, in the order they were asked for, each with the parts its own
 * action requires.
 *
 * **Order is a real property here.** A calendar that keeps every alarm shows
 * them all and the order is invisible; an Exchange mailbox keeps exactly one
 * per item and keeps the first, so on a Microsoft reader the first entry is the
 * only reminder anybody gets.
 *
 * **The one place a client's disagreement is the subject rather than a
 * disqualification.** Every other knob here is a property all three clients
 * honour; the alarms are kept in full precisely because the three do *not*
 * agree — Apple keeps what the organiser sent, Google replaces it with the
 * reader's own defaults, Exchange keeps one — and watching that happen is the
 * point.
 *
 * Each action needs different lines and a client will reject an alarm missing
 * them: a display alarm needs text to show, an email alarm needs a subject and
 * somebody to send it to, and an audio alarm needs neither.
 */
function alarmLines(input: InvitationInput): string[] {
  return input.alarms.flatMap((alarm) => {
    const trigger = property(
      "TRIGGER",
      `-PT${alarm.minutesBefore}M`,
      alarm.anchor === "end" ? ";RELATED=END" : "",
    );
    const lines = ["BEGIN:VALARM", `ACTION:${ALARM_ACTIONS[alarm.action]}`, trigger];
    if (alarm.action !== "audio") {
      lines.push(property("DESCRIPTION", escapeText(input.summary)));
    }
    if (alarm.action === "email") {
      lines.push(
        property("SUMMARY", escapeText(input.summary)),
        foldLine(`ATTENDEE:mailto:${input.alarmEmail}`),
      );
    }
    lines.push("END:VALARM");
    return lines;
  });
}

// --- The event ---

/** A property emitted only when its value is not blank. */
function optional(name: string, value: string, params = ""): string[] {
  return value.trim() === "" ? [] : [property(name, value, params)];
}

/**
 * Everything a `VEVENT` states that is not its schedule.
 *
 * Shared by the master and by every override, and that sharing is the design
 * rather than a saving: an overridden occurrence differs from the rest in *when
 * it happens*, and a client comparing the two components should find one
 * difference. A summary or an attendee that drifted between them would be a
 * second difference nobody asked for, and it would show up as an occurrence
 * that mysteriously lost its RSVP.
 */
function eventContentLines(input: InvitationInput): string[] {
  const lines: string[] = [
    property("SUMMARY", escapeText(input.summary)),
    ...optional("DESCRIPTION", escapeText(input.description)),
    ...optional("LOCATION", escapeText(input.location)),
    // A URI, not TEXT: RFC 5545 §3.3.13 does not escape it, and escaping would
    // corrupt the query string of any link that carries one.
    ...optional("URL", input.url),
  ];

  // RFC 5546 wants an organizer on every method, a `PUBLISH` included — it says
  // who the entry came from. The `ATTENDEE` is what carries RSVP semantics, and
  // whether one is written at all is the caller's answer.
  lines.push(calendarUser("ORGANIZER", input.organizer));
  if (input.attendee !== null) {
    const params = [
      `;ROLE=${input.attendee.role}`,
      `;PARTSTAT=${input.attendee.partstat}`,
      `;RSVP=${input.attendee.rsvp ? "TRUE" : "FALSE"}`,
    ].join("");
    lines.push(calendarUser("ATTENDEE", input.attendee, params));
  }

  lines.push(`STATUS:${input.status.toUpperCase()}`);
  lines.push(`TRANSP:${input.showAs === "busy" ? "OPAQUE" : "TRANSPARENT"}`);
  lines.push(...alarmLines(input));
  return lines;
}

/** One `VEVENT`: the identity every component shares, then its own schedule. */
function eventLines(input: InvitationInput, schedule: readonly string[]): string[] {
  return [
    "BEGIN:VEVENT",
    property("UID", input.uid),
    property("DTSTAMP", formatUtcTimestamp(input.now)),
    `SEQUENCE:${input.sequence}`,
    ...schedule,
    ...eventContentLines(input),
    "END:VEVENT",
  ];
}

/**
 * An overridden occurrence's schedule: which one it replaces, and when it
 * happens instead.
 *
 * `RECURRENCE-ID` names the occurrence **as the rule would have produced it** —
 * that day at the rule's own clock face — because that is the only value a
 * client can match against what it already holds. Writing the *new* time there
 * is the classic way to get an override that silently creates a second entry
 * beside the one it was meant to replace.
 */
function overrideScheduleLines(
  input: InvitationInput,
  override: InvitationOverride,
): string[] {
  const params = timeParams(input);
  const lines = [
    property(
      "RECURRENCE-ID",
      timeValue(input, { date: override.date, time: input.start.time }),
      params,
    ),
    property("DTSTART", timeValue(input, { date: override.date, time: override.time }), params),
  ];
  if (input.allDay) {
    // A DATE-valued document has no clock face for an override to move, so the
    // component restates the same day and differs from the master in nothing
    // but being an exception. It is written rather than refused because what a
    // client does with that is itself worth seeing.
    lines.push(
      property("DTEND", compactDate(dayString(parseDay(override.date) + DAY_MS)), params),
    );
  } else {
    lines.push(
      property("DURATION", isoDuration(override.durationMinutes ?? input.durationMinutes)),
    );
  }
  return lines;
}

/**
 * Serialize the whole message, CRLF-terminated throughout.
 *
 * The `METHOD` is at the calendar level rather than on the event, which is what
 * makes the document an iTIP message rather than a calendar that happens to
 * contain one. The zone block is emitted only when some property actually
 * references the zone by name: an all-day document states DATE values that
 * carry no zone, and an instant-form document names none either, so in both
 * cases a `VTIMEZONE` would describe a reference nothing makes.
 *
 * The master component comes first and the overrides follow it, which is the
 * order RFC 5545 expects and the order a client applies them in — an exception
 * read before the rule it excepts has nothing to attach itself to.
 */
export function buildInvitation(input: InvitationInput): InvitationResult {
  const occurrenceCount = occurrenceCountOf(input);
  if (occurrenceCount === 0) return { ok: false, reason: "no-occurrences" };

  // Only a rule has occurrences for an exception to name. A single event that
  // arrived with overrides has nothing to override, so they are dropped rather
  // than written as components a client cannot match to anything.
  const overrides =
    input.recurrence.kind === "weekly"
      ? input.overrides.map((override) =>
          eventLines(input, overrideScheduleLines(input, override)),
        )
      : [];

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    property("PRODID", ICS_PRODID),
    "CALSCALE:GREGORIAN",
    property("METHOD", METHOD_NAMES[input.method]),
    ...(writesTzid(input) ? zoneBlock(input.timezone) : []),
    ...eventLines(input, scheduleLines(input)),
    ...overrides.flat(),
    "END:VCALENDAR",
  ];

  return {
    ok: true,
    // A trailing CRLF as well: a content line is terminated by one, and the
    // last line of the document is not an exception.
    ics: `${lines.join(CRLF)}${CRLF}`,
    occurrenceCount,
  };
}
