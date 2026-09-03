import type { SupportedLocale } from "@/lib/constants/locales";
import {
  buildCalendarFeedEvents,
  type CalendarFeedEvent,
  type FeedSeat,
} from "@/lib/calendar-feed/events";
import {
  CALENDAR_FEED_DEFAULTS,
  type CalendarFeedOptions,
} from "@/lib/calendar-feed/options";
import {
  ICS_PRODID,
  escapeText,
  foldLine,
  formatUtcTimestamp,
  formatZonedTimestamp,
} from "@/lib/calendar-feed/ics";
import type { CalendarFeedTranslator } from "@/lib/calendar-feed/translator";
import { SENDER_EMAIL, SENDER_NAME } from "@/lib/constants";
import {
  reminderMinutes,
  type InvitationMethod,
  type InvitationReminder,
  type InvitationShape,
} from "./options";

/**
 * One participation as an iTIP calendar message.
 *
 * **Why this is not the feed writer.** A feed is a document a client polls and
 * takes wholesale; an invitation is a *message* addressed to somebody, and
 * three properties the feed has no use for are the whole of what makes it one:
 * `ORGANIZER` and `ATTENDEE` say who is asking whom, and `SEQUENCE` says which
 * revision this is. The shared writer's event type cannot express any of them,
 * and that file is not this change's to widen — so the serialisation here is a
 * second, smaller writer built out of the shared one's *exported* primitives.
 * The escaping, the octet-counted folding and both timestamp forms are
 * imported, so the two writers cannot disagree about the parts that are hard.
 *
 * The one thing that had to be copied rather than imported is the
 * `Europe/Helsinki` `VTIMEZONE` block, which the shared writer holds privately.
 * It is copied verbatim below and marked; the right fix, when the feed module
 * is next open for editing, is to export it there and delete the copy.
 *
 * **The occurrence expansion is shared, not reimplemented.** The sessions this
 * message states come from the same walk the feed runs, over the same neutral
 * seat shape, so an invitation cannot describe a schedule the feed disagrees
 * with.
 */

const CRLF = "\r\n";

/** The zone the copied `VTIMEZONE` describes. Every product we run is in it. */
const KNOWN_TIMEZONE = "Europe/Helsinki";

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
  /** The stored base `UID`. Every `VEVENT` here is a suffix of it. */
  baseUid: string;
  sequence: number;
  method: InvitationMethod;
  shape: InvitationShape;
  reminder: InvitationReminder;
  attendee: InvitationAttendee;
  translate: CalendarFeedTranslator;
  locale: SupportedLocale;
  now: Date;
}

/**
 * The feed options this message expands its sessions under.
 *
 * Fixed rather than exposed, because they are not what is being compared here:
 * the feed card already offers every one of them, and an invitation adds its
 * own three questions (shape, reminder, RSVP-or-not) on top of a schedule that
 * has to stay recognisable between a send and its update. `details: "basic"`
 * gives the description its gamer and type lines and no link, which is why no
 * origin is needed; the scope is the whole family because the seat handed in is
 * already the only one.
 */
function feedOptions(shape: InvitationShape): CalendarFeedOptions {
  return {
    ...CALENDAR_FEED_DEFAULTS,
    mode: shape === "series" ? "rrule" : "discrete",
  };
}

/**
 * The sessions this message states.
 *
 * Discrete mode is filtered to what is still ahead: the feed deliberately
 * carries a week of look-back so the current week reads complete in a
 * subscription, but inviting somebody to a session that already happened is a
 * different thing entirely, and a client would put an RSVP prompt on it.
 */
function invitationEvents(args: BuildInvitationArgs): CalendarFeedEvent[] {
  const events = buildCalendarFeedEvents({
    seats: [args.seat],
    options: feedOptions(args.shape),
    translate: args.translate,
    locale: args.locale,
    // Unused: `details: "basic"` emits no `URL`, so nothing here is absolute.
    origin: "",
    now: args.now,
  });
  if (args.shape === "series") return events;
  return events.filter((event) => event.start.getTime() >= args.now.getTime());
}

/**
 * A `VEVENT`'s own `UID`, suffixed off the stored base.
 *
 * The shared expansion already writes a per-slot or per-date UID and those
 * suffixes are exactly the discriminator wanted here — but its prefix is the
 * participation id, and an invitation's identity has to survive a cancellation
 * (which retires the whole conversation and starts a new one on the same seat).
 * So the suffix is lifted off the expansion's UID and re-hung on the stored
 * base, which is the part bookkeeping owns.
 */
function eventUid(
  baseUid: string,
  participationId: string,
  feedUid: string,
): string {
  const withoutDomain = feedUid.replace(/@sogverse$/, "");
  const prefix = `${participationId}-`;
  const suffix = withoutDomain.startsWith(prefix)
    ? withoutDomain.slice(prefix.length)
    : withoutDomain;
  return `${suffix}-${baseUid}`;
}

/**
 * One event's `DTSTART`/`DTEND` pair.
 *
 * A series is stated as a wall clock in the product's own zone, because a
 * weekly rule hung off a UTC instant drifts an hour across a DST transition
 * while the schedule it describes does not move. A discrete occurrence is an
 * absolute instant, which is unambiguous and needs no `VTIMEZONE` at all.
 */
function timeLines(event: CalendarFeedEvent, zoned: boolean): string[] {
  if (!zoned) {
    return [
      property("DTSTART", formatUtcTimestamp(event.start)),
      property("DTEND", formatUtcTimestamp(event.end)),
    ];
  }
  const params = `;TZID=${event.timezone}`;
  return [
    property("DTSTART", formatZonedTimestamp(event.start, event.timezone), params),
    property("DTEND", formatZonedTimestamp(event.end, event.timezone), params),
  ];
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

function eventLines(
  event: CalendarFeedEvent,
  args: BuildInvitationArgs,
  dtstamp: Date,
): string[] {
  const cancelled = args.method === "CANCEL";
  // An invitation is an appointment somebody is being asked to keep, so it
  // occupies the time. The feed offers free-versus-busy as a knob because a
  // subscribed calendar of somebody else's children is arguably neither.
  const lines: string[] = [
    "BEGIN:VEVENT",
    property(
      "UID",
      eventUid(args.baseUid, args.seat.participationId, event.uid),
    ),
    property("DTSTAMP", formatUtcTimestamp(dtstamp)),
    `SEQUENCE:${args.sequence}`,
    ...timeLines(event, args.shape === "series"),
  ];

  if (event.rrule !== null) lines.push(property("RRULE", event.rrule));

  lines.push(property("SUMMARY", escapeText(event.summary)));
  if (event.description !== null) {
    lines.push(property("DESCRIPTION", escapeText(event.description)));
  }
  if (event.location !== null) {
    lines.push(property("LOCATION", escapeText(event.location)));
  }

  // `PUBLISH` is the deliberately RSVP-less experience: an object a reader adds
  // to their calendar with nobody asking them anything. Naming an organizer and
  // an attendee is precisely what would turn it back into a question.
  if (args.method !== "PUBLISH") {
    lines.push(
      calendarUser("ORGANIZER", SENDER_NAME, SENDER_EMAIL),
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
  // happening.
  if (minutes !== null && !cancelled) {
    lines.push(...alarmLines(minutes, event.summary));
  }

  lines.push("END:VEVENT");
  return lines;
}

/**
 * Serialize the whole message, CRLF-terminated throughout.
 *
 * The `METHOD` is at the calendar level rather than per event, which is what
 * makes the document an iTIP message rather than a calendar that happens to
 * contain events — and it has to agree with how the mail part is typed, which
 * is why the transport takes the same value rather than deriving one.
 */
export function buildInvitationCalendar(args: BuildInvitationArgs): string {
  const events = invitationEvents(args);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    property("PRODID", ICS_PRODID),
    "CALSCALE:GREGORIAN",
    property("METHOD", args.method),
  ];

  if (args.shape === "series" && events.some((e) => e.timezone === KNOWN_TIMEZONE)) {
    lines.push(...HELSINKI_VTIMEZONE);
  }

  for (const event of events) {
    lines.push(...eventLines(event, args, args.now));
  }

  lines.push("END:VCALENDAR");
  return `${lines.join(CRLF)}${CRLF}`;
}
