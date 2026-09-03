import { formatInTimeZone } from "date-fns-tz";

/**
 * A small hand-rolled RFC 5545 serializer.
 *
 * No dependency: the published ICS builders are either large, or opinionated
 * about a data model we do not have, and the subset a schedule-of-record feed
 * needs is one page of code. What that page has to get right is the part every
 * naive `.ics` writer gets wrong — CRLF endings, **octet**-counted line folding,
 * and TEXT escaping — so those three are the tested core here and everything
 * else is composition.
 *
 * The one deliberate limit is `VTIMEZONE`: generating a correct one for an
 * arbitrary IANA zone means shipping a transition database, so this module
 * knows `Europe/Helsinki` (which is every product we run) and, for anything
 * else, emits the `TZID` reference alone plus a note saying so. Clients
 * generally resolve a well-known TZID from their own database, so the reference
 * on its own is usually enough — but it is a *usually*, which is exactly why
 * the note exists.
 */

export const ICS_PRODID = "-//School of Gaming//Sogverse//EN";

/** RFC 5545 §3.1: a content line is at most 75 **octets**, excluding the CRLF. */
const MAX_LINE_OCTETS = 75;

const CRLF = "\r\n";

const encoder = new TextEncoder();

/**
 * Fold one content line to RFC 5545's 75-octet limit.
 *
 * Octets, not characters, and the difference is not academic: a Finnish or
 * Swedish product name is full of two-byte letters, so a fold counted in
 * characters silently emits lines a strict parser rejects. The walk is by
 * **code point** (`for…of` over a string), so a multi-byte sequence is never
 * split down the middle, and a continuation line's leading space is charged
 * against its own 75 because it is part of that line.
 */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= MAX_LINE_OCTETS) return line;

  const chunks: string[] = [];
  let current = "";
  let used = 0;
  // The first line spends all 75 octets on content; every continuation spends
  // one of them on the space that marks it as a continuation.
  let limit = MAX_LINE_OCTETS;

  for (const character of line) {
    const size = encoder.encode(character).length;
    if (used + size > limit) {
      chunks.push(current);
      current = "";
      used = 0;
      limit = MAX_LINE_OCTETS - 1;
    }
    current += character;
    used += size;
  }
  chunks.push(current);

  return chunks.join(`${CRLF} `);
}

/**
 * Escape a TEXT value per RFC 5545 §3.3.11. The backslash goes first or it
 * re-escapes the escapes the later replacements add.
 */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** `YYYYMMDDTHHMMSSZ` — an absolute instant, the UTC form. */
export function formatUtcTimestamp(instant: Date): string {
  return formatInTimeZone(instant, "UTC", "yyyyMMdd'T'HHmmss'Z'");
}

/** `YYYYMMDDTHHMMSS` — the wall clock the instant shows in `timeZone`. */
export function formatZonedTimestamp(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "yyyyMMdd'T'HHmmss");
}

/**
 * A point in time as the feed states it: either an absolute instant (`tzid`
 * null, the `…Z` form) or a wall clock in a named zone.
 */
export interface IcsDateTime {
  instant: Date;
  tzid: string | null;
}

export interface IcsAlarm {
  minutesBefore: number;
  description: string;
}

export interface IcsEvent {
  /** Stable across polls — this is what makes a client update in place. */
  uid: string;
  start: IcsDateTime;
  end: IcsDateTime;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  /** The rule body, without the `RRULE:` name. Recurring events only. */
  rrule?: string;
  /** `true` renders `TRANSP:TRANSPARENT` — the event does not block free/busy. */
  transparent: boolean;
  alarm?: IcsAlarm;
}

export interface IcsCalendarInput {
  /** `X-WR-CALNAME` — what the client lists the subscription as. */
  calendarName: string;
  /** `X-APPLE-CALENDAR-COLOR`, or null to emit none. */
  color?: string | null;
  /** An ISO 8601 duration for `REFRESH-INTERVAL`/`X-PUBLISHED-TTL`, or null. */
  refreshDuration?: string | null;
  /**
   * The `METHOD` value, or null to emit none.
   *
   * `PUBLISH` is what a published calendar conventionally states, and it is
   * also what makes some readers treat the document as an iTIP message rather
   * than a subscription — so which one a feed wants is a question for the
   * clients rather than for this writer, and the caller answers it.
   */
  method?: string | null;
  /** One `DTSTAMP` for the whole document — this poll's instant. */
  dtstamp: Date;
  events: readonly IcsEvent[];
}

/** The zone this module can describe fully. Every product we run is in it. */
const KNOWN_TIMEZONE = "Europe/Helsinki";

/**
 * `Europe/Helsinki` under the EU rule: EET (+02:00) in winter, EEST (+03:00)
 * from the last Sunday of March at 03:00 local to the last Sunday of October at
 * 04:00 local — both of which are 01:00 UTC, which is what makes them one rule
 * rather than two. The 1970 `DTSTART`s are the conventional anchors: each is a
 * last Sunday of its month, stated in the offset in force *before* its own
 * transition.
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

function dateTimeProperty(name: string, when: IcsDateTime): string {
  return when.tzid === null
    ? property(name, formatUtcTimestamp(when.instant))
    : property(
        name,
        formatZonedTimestamp(when.instant, when.tzid),
        `;TZID=${when.tzid}`,
      );
}

function alarmLines(alarm: IcsAlarm): string[] {
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    property("TRIGGER", `-PT${alarm.minutesBefore}M`),
    property("DESCRIPTION", escapeText(alarm.description)),
    "END:VALARM",
  ];
}

function eventLines(event: IcsEvent, dtstamp: Date): string[] {
  const lines = [
    "BEGIN:VEVENT",
    property("UID", event.uid),
    property("DTSTAMP", formatUtcTimestamp(dtstamp)),
    dateTimeProperty("DTSTART", event.start),
    dateTimeProperty("DTEND", event.end),
  ];
  if (event.rrule !== undefined) lines.push(property("RRULE", event.rrule));
  lines.push(property("SUMMARY", escapeText(event.summary)));
  if (event.description !== undefined) {
    lines.push(property("DESCRIPTION", escapeText(event.description)));
  }
  if (event.location !== undefined) {
    lines.push(property("LOCATION", escapeText(event.location)));
  }
  // A URI, not TEXT: RFC 5545 §3.3.13 does not escape it, and escaping would
  // corrupt the query string of any link that carries one.
  if (event.url !== undefined) lines.push(property("URL", event.url));
  lines.push(`TRANSP:${event.transparent ? "TRANSPARENT" : "OPAQUE"}`);
  if (event.alarm !== undefined) lines.push(...alarmLines(event.alarm));
  lines.push("END:VEVENT");
  return lines;
}

/**
 * Every distinct zone the events actually name — which is what decides whether
 * a `VTIMEZONE` is emitted at all. Keeping that decision here rather than in the
 * caller is what makes "a TZID reference always has its component, when we can
 * write one" a property of the writer instead of a convention.
 */
function usedTimezones(events: readonly IcsEvent[]): string[] {
  const zones = new Set<string>();
  for (const event of events) {
    if (event.start.tzid !== null) zones.add(event.start.tzid);
    if (event.end.tzid !== null) zones.add(event.end.tzid);
  }
  return [...zones].sort();
}

/** Serialize a whole calendar document, CRLF-terminated throughout. */
export function buildIcsCalendar(input: IcsCalendarInput): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    property("PRODID", ICS_PRODID),
    "CALSCALE:GREGORIAN",
  ];

  if (input.method) lines.push(property("METHOD", input.method));
  lines.push(property("X-WR-CALNAME", escapeText(input.calendarName)));

  if (input.color) lines.push(property("X-APPLE-CALENDAR-COLOR", input.color));
  if (input.refreshDuration) {
    lines.push(
      property("REFRESH-INTERVAL", input.refreshDuration, ";VALUE=DURATION"),
      property("X-PUBLISHED-TTL", input.refreshDuration),
    );
  }

  const zones = usedTimezones(input.events);
  const unsupported = zones.filter((zone) => zone !== KNOWN_TIMEZONE);
  for (const zone of unsupported) {
    lines.push(
      property(
        "X-SOGVERSE-NOTE",
        escapeText(
          `No VTIMEZONE is emitted for ${zone}: this exploration ships transition rules for ${KNOWN_TIMEZONE} only, so the TZID reference relies on the client's own timezone database.`,
        ),
      ),
    );
  }
  if (zones.includes(KNOWN_TIMEZONE)) lines.push(...HELSINKI_VTIMEZONE);

  for (const event of input.events) {
    lines.push(...eventLines(event, input.dtstamp));
  }

  lines.push("END:VCALENDAR");
  // A trailing CRLF as well: a content line is terminated by one, and the last
  // line of the document is not an exception.
  return `${lines.join(CRLF)}${CRLF}`;
}
