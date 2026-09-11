import { formatInTimeZone } from "date-fns-tz";
import { DEFAULT_TIMEZONE } from "@/lib/constants/locales";
import {
  buildInvitation,
  lastOccurrenceDate,
  type InvitationAlarm,
  type InvitationAttendee,
  type InvitationMethod,
  type InvitationOverride,
  type InvitationPartstat,
  type InvitationRecurrence,
  type InvitationRole,
  type InvitationShowAs,
  type InvitationStatus,
  type InvitationTimeForm,
} from "@/lib/calendar-invitations/invitation";
import { SUPPORTED_TIMEZONES } from "@/lib/calendar-invitations/ics-primitives";
import {
  fail,
  FORM_YES_NO,
  optionalUrl,
  optionalWholeNumber,
  requireDate,
  requireEmail,
  requireTime,
  requireWholeNumber,
  textareaLines,
} from "./form-fields";
import { wrapInLayout } from "./layout";
import { escapeHtml, paragraph } from "./utils";
import { textAttachment, type RenderedAttachment } from "./attachments";
import type { EmailTranslator } from "./translator";

/**
 * The calendar invite explorer: one mail, one `invite.ics`, and a form field
 * for every property worth exploring.
 *
 * **This template is a laboratory, not a product mail.** What is being tried is
 * not our wording but what a calendar client does with each property of an
 * iCalendar document — so the fields are RFC 5545 and RFC 5546 rather than a
 * gamer, a product and a Gedu. It replaced a template that asked what School of
 * Gaming wanted to *say*, which turned out to be the wrong question to be
 * asking first: the format's own behaviour has to be known before any sentence
 * written on top of it can be trusted to arrive.
 *
 * **The audience is Google Calendar, Apple Calendar and Outlook, and a
 * property is a field only if all three honour it.** A knob one of them drops
 * teaches nothing but its own absence, and it makes every send ambiguous — a
 * difference that fails to appear could be the client or could be the property
 * never having been supported. That is why there is no `X-ALT-DESC`, no `GEO`,
 * no `CATEGORIES`, `PRIORITY` or `CLASS`, no Microsoft busy status, none of the
 * RFC 7986 additions, and no explicit `RDATE` list.
 *
 * **The defaults are a baseline, and every send after the first changes one
 * thing.** Every field's untouched value composes an ordinary, unremarkable
 * invitation: a single occurrence, next Monday, in Helsinki, with two
 * reminders. That is what makes a difference legible — a client that renders
 * the baseline and mangles the next send has told you exactly which property it
 * mangled.
 *
 * **The mail around the document is incidental.** A subject and a body, both
 * typed into the form, in the house shell — the shell because every mail this
 * codebase renders is swept for house style and a bare `<p>` would be the one
 * document with no palette, no lockup and no plain-text twin to check. Nothing
 * about the mail is composed from the calendar's own values.
 *
 * **One resolution per render.** The identifier is minted where the document is
 * built, so the mail, the file and the copy the admin reads back after a send
 * all state the one that resolution produced.
 */

// --- The values the form offers, each tuple ordered so its first entry is the
//     default: an untouched select posts its first option. ---

export const CALENDAR_EXPLORER_METHODS = ["request", "publish", "cancel"] as const;
export const CALENDAR_EXPLORER_STATUSES = ["confirmed", "tentative", "cancelled"] as const;
export const CALENDAR_EXPLORER_TIME_FORMS = ["tzid", "utc"] as const;
export const CALENDAR_EXPLORER_RECURRENCES = ["none", "weekly"] as const;
export const CALENDAR_EXPLORER_ROLES = [
  "REQ-PARTICIPANT",
  "OPT-PARTICIPANT",
  "NON-PARTICIPANT",
] as const;
export const CALENDAR_EXPLORER_PARTSTATS = [
  "NEEDS-ACTION",
  "ACCEPTED",
  "TENTATIVE",
  "DECLINED",
] as const;
export const CALENDAR_EXPLORER_SHOW_AS = ["free", "busy"] as const;
export const CALENDAR_EXPLORER_ALARM_ACTIONS = ["display", "email", "audio"] as const;
export const CALENDAR_EXPLORER_ALARM_ANCHORS = ["start", "end"] as const;
/** The shared form vocabulary, re-exported under this form's own name. */
export const CALENDAR_EXPLORER_YES_NO = FORM_YES_NO;

/**
 * The alarm offsets, in minutes, plus the `none` that writes no alarm.
 *
 * Listed in one canonical order and rotated per field, because each of the
 * three alarms has a different default and an untouched select posts its first
 * option — so the tuple is the vocabulary and the rotation is the default.
 */
export const CALENDAR_EXPLORER_ALARM_OFFSETS = [
  "none",
  "0",
  "5",
  "15",
  "30",
  "60",
  "120",
  "1440",
  "2880",
] as const;

export type CalendarExplorerAlarmOffset =
  (typeof CALENDAR_EXPLORER_ALARM_OFFSETS)[number];

/** The offsets with `first` moved to the front, for one alarm's select. */
export function calendarExplorerAlarmOffsets(
  first: CalendarExplorerAlarmOffset,
): CalendarExplorerAlarmOffset[] {
  return [first, ...CALENDAR_EXPLORER_ALARM_OFFSETS.filter((value) => value !== first)];
}

/**
 * The weekday patterns a `BYDAY` can be built from.
 *
 * Presets rather than seven checkboxes because the testing form's fields are
 * single values. The single days come first so the baseline rule matches the
 * baseline start date — a `DTSTART` that does not satisfy its own rule is a
 * legal but confusing document, and it is not what the first send should be.
 */
export const CALENDAR_EXPLORER_WEEKDAY_PRESETS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
  "mon-wed-fri",
  "tue-thu",
  "mon-fri",
  "sat-sun",
  "every-day",
] as const;

export type CalendarExplorerWeekdayPreset =
  (typeof CALENDAR_EXPLORER_WEEKDAY_PRESETS)[number];

/** `0` = Monday … `6` = Sunday, as RFC 5545 orders `BYDAY`. */
export const CALENDAR_EXPLORER_WEEKDAYS: Record<
  CalendarExplorerWeekdayPreset,
  number[]
> = {
  mon: [0],
  tue: [1],
  wed: [2],
  thu: [3],
  fri: [4],
  sat: [5],
  sun: [6],
  "mon-wed-fri": [0, 2, 4],
  "tue-thu": [1, 3],
  "mon-fri": [0, 1, 2, 3, 4],
  "sat-sun": [5, 6],
  "every-day": [0, 1, 2, 3, 4, 5, 6],
};

/** The zones the document can describe, offered in the order the writer lists them. */
export const CALENDAR_EXPLORER_TIMEZONES = SUPPORTED_TIMEZONES;

/**
 * The next Monday, and four weeks after it, as `YYYY-MM-DD`.
 *
 * **Read when a field is read, never at module load.** The registry these two
 * are placeholders in is imported by the admin page as well as by the send
 * route, so a value frozen at load is frozen at two different moments — a
 * server process kept alive for days against a browser that has just fetched
 * the bundle — and the two would disagree across a hydration.
 *
 * They are only ever placeholders. An invitation dated in the past tells you
 * nothing about how a client renders one, which is why the suggestion moves
 * with the calendar at all. "Today" is read in the zone the baseline document
 * is authored in — a bare date has no zone of its own, and reading it in UTC
 * would suggest yesterday's Monday to a Helsinki reader for two hours every
 * night. The step to Monday and the four weeks after it are UTC-pinned calendar
 * arithmetic, which is exact.
 */
function upcomingMonday(weeksAhead: number): string {
  const [year, month, day] = formatInTimeZone(new Date(), DEFAULT_TIMEZONE, "yyyy-MM-dd")
    .split("-")
    .map(Number);
  const today = Date.UTC(year, month - 1, day);
  // 0 = Sunday from `getUTCDay`; the step to the *following* Monday is 1..7.
  const toMonday = ((8 - new Date(today).getUTCDay()) % 7) || 7;
  const target = new Date(today + (toMonday + weeksAhead * 7) * 86_400_000);
  const targetMonth = `${target.getUTCMonth() + 1}`.padStart(2, "0");
  const targetDay = `${target.getUTCDate()}`.padStart(2, "0");
  return `${target.getUTCFullYear()}-${targetMonth}-${targetDay}`;
}

/** The `DTSTART` date an untouched form suggests: the next Monday. */
export function calendarInvitationStartDate(): string {
  return upcomingMonday(0);
}

/** The date the recurrence fields suggest: four weeks after that Monday. */
export function calendarInvitationUntilDate(): string {
  return upcomingMonday(4);
}

/**
 * The mail's own words, and the one textarea whose emptiness is not an absence.
 *
 * Every *calendar* field takes the page's plain reading — an untouched textarea
 * posts nothing, and nothing means the property is omitted — because whether a
 * client copes with a missing `DESCRIPTION` is itself a thing to try. The mail
 * body is the exception: a message with no words in it is not a baseline
 * message, it is a broken one, and the baseline has to be sendable without
 * typing anything. One constant serves as the field's placeholder and as its
 * empty value, so the two cannot drift apart.
 */
export const CALENDAR_EXPLORER_BODY =
  "This message carries a calendar invitation. Everything worth looking at is in the file attached to it.";

/** The subject an untouched form sends under, and the baseline `SUMMARY`. */
export const CALENDAR_EXPLORER_TITLE = "Calendar invite explorer";

/**
 * The form's fields, as strings.
 *
 * Every one of them is a string because that is what the testing form posts;
 * turning them into dates, numbers and URIs is the resolver's job, and it is
 * the only place that knows what a blank one means.
 */
export interface CalendarInvitationParams {
  subject: string;
  body: string;

  uid: string;
  sequence: string;
  method: (typeof CALENDAR_EXPLORER_METHODS)[number];
  status: (typeof CALENDAR_EXPLORER_STATUSES)[number];

  timezone: string;
  startDate: string;
  startTime: string;
  durationMinutes: string;
  timeForm: (typeof CALENDAR_EXPLORER_TIME_FORMS)[number];
  allDay: (typeof CALENDAR_EXPLORER_YES_NO)[number];

  recurrence: (typeof CALENDAR_EXPLORER_RECURRENCES)[number];
  weekdays: CalendarExplorerWeekdayPreset;
  until: string;
  count: string;
  interval: string;
  excludedDates: string;
  overrides: string;

  organizerName: string;
  organizerEmail: string;
  attendeeName: string;
  attendeeEmail: string;
  rsvp: (typeof CALENDAR_EXPLORER_YES_NO)[number];
  attendeeRole: InvitationRole;
  partstat: InvitationPartstat;
  includeAttendee: (typeof CALENDAR_EXPLORER_YES_NO)[number];

  summary: string;
  description: string;
  location: string;
  url: string;

  alert1Offset: CalendarExplorerAlarmOffset;
  alert1Action: (typeof CALENDAR_EXPLORER_ALARM_ACTIONS)[number];
  alert1RelativeTo: (typeof CALENDAR_EXPLORER_ALARM_ANCHORS)[number];
  alert2Offset: CalendarExplorerAlarmOffset;
  alert2Action: (typeof CALENDAR_EXPLORER_ALARM_ACTIONS)[number];
  alert2RelativeTo: (typeof CALENDAR_EXPLORER_ALARM_ANCHORS)[number];
  alert3Offset: CalendarExplorerAlarmOffset;
  alert3Action: (typeof CALENDAR_EXPLORER_ALARM_ACTIONS)[number];
  alert3RelativeTo: (typeof CALENDAR_EXPLORER_ALARM_ANCHORS)[number];

  showAs: InvitationShowAs;
}

/** What every part of a render reads: the mail's words, and the document itself. */
export interface CalendarInvitationContent {
  subject: string;
  body: string;
  /** The identifier the document was built under — minted here when the form named none. */
  resolvedUid: string;
  /** The calendar document, composed once per render. */
  ics: string;
}

// --- Validation. The pieces live in `form-fields.ts`, shared with every other
//     template whose form posts free text, so one malformed date earns one
//     sentence whichever form it was typed into. ---

function parseExcludedDates(value: string): string[] {
  return textareaLines(value).map((line) => requireDate(line, "Excluded dates"));
}

/** `0` = Monday … `6` = Sunday, from a `YYYY-MM-DD` read as a UTC-pinned day. */
function weekdayOf(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

/**
 * The override lines: `YYYY-MM-DD HH:MM`, optionally followed by a duration.
 *
 * **Each one has to name an occurrence the rule actually produces**, or it is a
 * `RECURRENCE-ID` matching nothing — which clients answer by silently creating
 * a second entry beside the one that was meant to move, and by the time anybody
 * notices there are two. So a date off the rule's weekdays, a date before the
 * run starts, a date past the last occurrence the rule states, or a date
 * already on the excluded list is refused here with the line quoted back. The
 * last of the four is walked rather than read off a field, because a `COUNT`
 * names no end date at all and an `UNTIL` names a day the run may not pass
 * rather than the day it stops on.
 *
 * `INTERVAL` is deliberately *not* checked: an override on an off week of a
 * fortnightly rule is a document worth being able to send, precisely because
 * what a client does with one is unobvious.
 */
function parseOverrides(
  value: string,
  startDate: string,
  recurrence: InvitationRecurrence,
  excluded: readonly string[],
): InvitationOverride[] {
  const parsed = textareaLines(value).map((line) => {
    const parts = line.split(/\s+/);
    if (parts.length !== 2 && parts.length !== 3) {
      fail("Overrides", "a date, a time, and optionally a duration in minutes", line);
    }
    const [date, time, duration] = parts;
    return {
      date: requireDate(date, "Overrides"),
      time: requireTime(time, "Overrides"),
      // Keyed on the line's own length rather than on the third element being
      // undefined: the check above has already settled that there are two parts
      // or three, and asking the array again is the form that survives a
      // destructure the compiler types as always-present.
      durationMinutes:
        parts.length === 3 ? requireWholeNumber(duration, "Override duration", 1) : null,
    };
  });

  if (parsed.length === 0) return [];
  if (recurrence.kind !== "weekly") {
    throw new Error(
      "Overrides: only the weekly rule has occurrences to override — a single event has nothing for a RECURRENCE-ID to name.",
    );
  }

  const weekdays = new Set(recurrence.weekdays);
  const excludedDates = new Set(excluded);
  const lastDate = lastOccurrenceDate(startDate, recurrence);
  for (const override of parsed) {
    // A plain string comparison, which is exact for `YYYY-MM-DD`: the format is
    // fixed-width and zero-padded, so lexical order is calendar order.
    if (override.date < startDate) {
      fail("Overrides", "a date on or after the start date", override.date);
    }
    if (lastDate !== null && override.date > lastDate) {
      fail("Overrides", `a date on or before ${lastDate}, the rule's last occurrence`, override.date);
    }
    if (!weekdays.has(weekdayOf(override.date))) {
      fail("Overrides", "a date the rule's BYDAY covers", override.date);
    }
    if (excludedDates.has(override.date)) {
      fail("Overrides", "a date that is not also on the excluded list", override.date);
    }
  }
  return parsed;
}

// --- Resolution ---

function alarmOf(
  offset: CalendarExplorerAlarmOffset,
  action: (typeof CALENDAR_EXPLORER_ALARM_ACTIONS)[number],
  anchor: (typeof CALENDAR_EXPLORER_ALARM_ANCHORS)[number],
): InvitationAlarm[] {
  return offset === "none"
    ? []
    : [{ minutesBefore: Number(offset), action, anchor }];
}

/**
 * The rule, with the one check neither field can make on its own.
 *
 * An `UNTIL` before the start states a run that ends before it begins, and the
 * document a client is handed for it is not empty — `DTSTART` is an occurrence
 * whatever the rule says — so nothing downstream would refuse it and the
 * invitation would go out stating a rule that produces exactly one day. It is
 * caught here, where the message can say which of the two dates is the problem.
 */
function recurrenceOf(
  params: CalendarInvitationParams,
  startDate: string,
): InvitationRecurrence {
  if (params.recurrence === "none") return { kind: "none" };
  const until = params.until.trim() === "" ? null : requireDate(params.until, "UNTIL");
  // A plain string comparison, which is exact for `YYYY-MM-DD`: the format is
  // fixed-width and zero-padded, so lexical order is calendar order.
  if (until !== null && until < startDate) {
    throw new Error(`UNTIL: the end date is before the start date, ${startDate}.`);
  }
  return {
    kind: "weekly",
    weekdays: CALENDAR_EXPLORER_WEEKDAYS[params.weekdays],
    interval: requireWholeNumber(params.interval, "INTERVAL", 1),
    until,
    count: optionalWholeNumber(params.count, "COUNT", 1),
  };
}

function attendeeOf(params: CalendarInvitationParams): InvitationAttendee | null {
  if (params.includeAttendee === "no") return null;
  return {
    name: params.attendeeName,
    email: requireEmail(params.attendeeEmail, "Attendee email"),
    role: params.attendeeRole,
    partstat: params.partstat,
    rsvp: params.rsvp === "yes",
  };
}

/**
 * The form's strings as one calendar document, composed exactly once.
 *
 * **Once is the point.** The identifier is minted here when the form names
 * none, and every part of the render that carries it — the file the reader
 * gets, the copy the admin reads back after a send — has to carry the *same*
 * one, or there is no way to send an update against what went out.
 *
 * A document with no occurrence in it throws rather than being serialised: an
 * empty calendar says nothing to a client, and the message is written for the
 * admin composing it to read.
 */
export function resolveCalendarInvitation(
  params: CalendarInvitationParams,
): CalendarInvitationContent {
  const uid = params.uid.trim() === "" ? `${crypto.randomUUID()}@sogverse` : params.uid.trim();
  const body = params.body.trim() === "" ? CALENDAR_EXPLORER_BODY : params.body;
  const startDate = requireDate(params.startDate, "Start date");
  const recurrence = recurrenceOf(params, startDate);
  const excludedDates = parseExcludedDates(params.excludedDates);
  const alarms = [
    ...alarmOf(params.alert1Offset, params.alert1Action, params.alert1RelativeTo),
    ...alarmOf(params.alert2Offset, params.alert2Action, params.alert2RelativeTo),
    ...alarmOf(params.alert3Offset, params.alert3Action, params.alert3RelativeTo),
  ];

  const built = buildInvitation({
    uid,
    sequence: requireWholeNumber(params.sequence, "SEQUENCE", 0),
    method: params.method satisfies InvitationMethod,
    status: params.status satisfies InvitationStatus,

    timezone: params.timezone,
    timeForm: params.timeForm satisfies InvitationTimeForm,
    allDay: params.allDay === "yes",
    start: { date: startDate, time: requireTime(params.startTime, "Start time") },
    durationMinutes: requireWholeNumber(params.durationMinutes, "Duration", 1),
    recurrence,
    excludedDates,
    overrides: parseOverrides(params.overrides, startDate, recurrence, excludedDates),

    organizer: {
      name: params.organizerName,
      email: requireEmail(params.organizerEmail, "Organizer email"),
    },
    attendee: attendeeOf(params),

    summary: params.summary,
    description: params.description,
    location: params.location,
    url: optionalUrl(params.url, "URL"),

    alarms,
    // An email alarm has to name somebody to write to, and the one address this
    // document knows is the attendee's — which is read whether or not the event
    // itself carries an `ATTENDEE`, because a published entry can still ask a
    // client to mail a reminder.
    //
    // **Validated only where it is read**, which is the `ATTENDEE` line and an
    // email alarm and nowhere else: a publish that writes neither never looks
    // at the field, and refusing a send over an address no line of the document
    // states is a refusal about nothing.
    alarmEmail: alarms.some((alarm) => alarm.action === "email")
      ? requireEmail(params.attendeeEmail, "Attendee email")
      : params.attendeeEmail.trim(),

    showAs: params.showAs,

    now: new Date(),
  });

  if (!built.ok) {
    throw new Error(
      "This calendar object states no occurrence at all — every occurrence it would have had, the start included, is on the excluded list.",
    );
  }

  return {
    subject: params.subject,
    body,
    resolvedUid: uid,
    ics: built.ics,
  };
}

/**
 * The mail, which is the typed body in the house shell and nothing else.
 *
 * The shell rather than a bare paragraph because every mail this codebase can
 * send is swept for house style — palette, corners, backgrounds, the header's
 * two invariants — and a document that opted out would be the one render none
 * of that reaches. It costs a header and a footer the reader is not here to
 * look at, and it buys the mail being an ordinary mail.
 */
export function buildCalendarInvitationEmail(
  t: EmailTranslator,
  locale: string,
  content: CalendarInvitationContent,
): string {
  return wrapInLayout({
    title: escapeHtml(content.subject),
    content: paragraph(escapeHtml(content.body).replace(/\n/g, "<br/>")),
    locale,
    t,
  });
}

/**
 * The same body as plain text.
 *
 * **Not a courtesy fallback — on a Microsoft mailbox it is the calendar entry's
 * notes.** Exchange fills the entry from the message body, and when the only
 * body is HTML it flattens that instead: the reader opens the occurrence in
 * their calendar and finds the mail's markup rendered as text, tracking pixel
 * and all. So the text part is the typed words exactly as typed.
 */
export function calendarInvitationText(content: CalendarInvitationContent): string {
  return content.body;
}

export function calendarInvitationSubject(content: CalendarInvitationContent): string {
  return content.subject;
}

/**
 * The `invite.ics` the mail carries.
 *
 * **The file name is load-bearing.** The provider infers the media type from
 * the extension, and `invite.ics` is what makes a client read the part as an
 * invitation rather than as a file to download — which is the difference
 * between an entry that can be updated in place and a copy nothing can find
 * again.
 */
export function calendarInvitationAttachment(
  content: CalendarInvitationContent,
): RenderedAttachment {
  return textAttachment("invite.ics", content.ics);
}
