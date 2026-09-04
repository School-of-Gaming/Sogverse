import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { DEFAULT_TIMEZONE } from "@/lib/constants/locales";
import { formatDateOnly, formatDateRange, formatTimeRange } from "@/lib/utils";
import { buildInvitation, type InvitationMethod, type InvitationShape } from "@/lib/calendar-invitations/invitation";
import { wrapInLayout } from "./layout";
import { escapeHtml, heading, paragraph, styledName, styledProductName } from "./utils";
import { ctaButton, factTable, sectionLabel } from "./blocks";
import { textAttachment, type RenderedAttachment } from "./attachments";
import type { EmailTranslator } from "./translator";

/**
 * The calendar invitation: one seat's whole schedule, mailed as `invite.ics`.
 *
 * **It is an email template like any other, and that is the finding it is built
 * on.** A calendar sent through the transactional REST API as an `invite.ics`
 * attachment is rendered by Gmail as a full inline invitation with RSVP
 * buttons — so the mail needs no separate transport, no relay credential and no
 * special send path, and it earns its registry entry the same way every other
 * template does: it can be composed from parameters and tried from the admin
 * testing tool before anybody builds the machinery that would send it for real.
 *
 * **The attachment is the content; the body is the accompaniment.** The mail
 * says who the sessions are for, when they are, and where — because a client
 * that does not render the invitation still has to leave the reader knowing
 * that much — and the `.ics` beside it is what a calendar acts on.
 *
 * **Three methods, one document.** A request asks the reader to answer, a
 * published entry asks nothing, and a cancellation withdraws what was stated
 * before. The subject and the heading move with the method, because an inbox
 * list is where a cancellation has to be recognisable as one.
 */

export const CALENDAR_INVITATION_METHODS = ["request", "publish", "cancel"] as const;
export const CALENDAR_INVITATION_SHAPES = ["rule", "list"] as const;
export const CALENDAR_INVITATION_PRODUCT_TYPES = ["club", "camp", "event"] as const;
export const CALENDAR_INVITATION_REMINDERS = ["none", "15", "60", "1440"] as const;

/**
 * The zones a schedule can be authored in, for the tool.
 *
 * Helsinki first because it is where every product we run is authored and the
 * one zone the writer ships transition rules for; the other three are here so
 * the note a document states about a zone it cannot describe can be seen.
 */
export const CALENDAR_INVITATION_TIMEZONES = [
  "Europe/Helsinki",
  "Europe/Stockholm",
  "Europe/Paris",
  "UTC",
] as const;

/**
 * The weekday patterns a product actually runs on, as presets.
 *
 * A preset rather than seven checkboxes because the testing form's fields are
 * single values, and because these are the shapes production has: consecutive
 * weekdays for a summer camp, a two- or three-day club week, and a single
 * weekly slot. `0` is Monday, as `schedule_slots` numbers weekdays.
 */
export const CALENDAR_INVITATION_WEEKDAY_PRESETS = [
  "mon-fri",
  "mon-wed-fri",
  "tue-thu",
  "mon",
  "wed",
  "sat",
] as const;

export type CalendarInvitationWeekdayPreset =
  (typeof CALENDAR_INVITATION_WEEKDAY_PRESETS)[number];

export const CALENDAR_INVITATION_WEEKDAYS: Record<
  CalendarInvitationWeekdayPreset,
  number[]
> = {
  "mon-fri": [0, 1, 2, 3, 4],
  "mon-wed-fri": [0, 2, 4],
  "tue-thu": [1, 3],
  mon: [0],
  wed: [2],
  sat: [5],
};

/**
 * The next Monday, and four weeks after it, as `YYYY-MM-DD`.
 *
 * **Computed once at module load, and only ever placeholders.** A form
 * suggesting a date in the past would be a form whose untouched render refuses
 * itself, so the suggestion moves with the calendar; a process kept alive for
 * days holds a value that is at most a few days stale, which is harmless
 * because it is a hint the admin types over and never what a real send carries.
 * "Today" is read in the zone products are authored in — a bare date has no
 * zone of its own, and reading it in UTC would suggest yesterday's Monday to a
 * Helsinki reader for two hours every night. The step to Monday and the four
 * weeks after it are UTC-pinned calendar arithmetic, which is exact.
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

export const CALENDAR_INVITATION_START_DATE = upcomingMonday(0);
export const CALENDAR_INVITATION_END_DATE = upcomingMonday(4);

export interface CalendarInvitationParams {
  parentFirstName: string;
  /** The `ATTENDEE`, and the one field that has to match the address the mail is sent to. */
  parentEmail: string;
  gamerFirstName: string;
  productName: string;
  productType: (typeof CALENDAR_INVITATION_PRODUCT_TYPES)[number];
  weekdays: CalendarInvitationWeekdayPreset;
  startDate: string;
  /** `null` for an open-ended run — which is what a consumer club is. */
  endDate: string | null;
  startTime: string;
  durationMinutes: string;
  timezone: string;
  /** `null` for an online session, which has no address to state. */
  address: string | null;
  arrivalInstructions: string | null;
  description: string | null;
  geduFirstName: string;
  spokenLanguage: string;
  reminder: (typeof CALENDAR_INVITATION_REMINDERS)[number];
  method: InvitationMethod;
  shape: InvitationShape;
  /** `null` mints a fresh one at render — a thread's second message types the first one's. */
  uid: string | null;
  sequence: string;
  dashboardUrl: string;
}

/** The params with every locale-aware value already formatted. */
interface CalendarInvitationContent extends CalendarInvitationParams {
  weekdayNumbers: number[];
  /** "Monday, Wednesday and Friday at 16:00 – 18:00 GMT+3", in the reader's locale. */
  scheduleLine: string;
  datesLine: string;
  languageName: string;
  typeName: string;
  minutes: number;
  reminderMinutes: number | null;
  sequenceNumber: number;
  resolvedUid: string;
}

/**
 * Weekday names in the reader's locale, from a UTC-pinned reference week.
 *
 * 2024-01-01 was a Monday, so day `n` of that week is weekday `n` under the
 * schema's Monday-first numbering. Pinned to UTC end to end through the
 * date-only formatter, because a weekday label is a name rather than a moment
 * and must not shift with anybody's zone.
 */
function weekdayNames(weekdays: readonly number[], locale: string): string[] {
  return weekdays.map((weekday) =>
    formatDateOnly(`2024-01-0${weekday + 1}`, locale, { weekday: "long" }),
  );
}

/**
 * The days joined the way the reader's language joins a list.
 *
 * `Intl.ListFormat` rather than a comma-join: "Monday, Wednesday and Friday"
 * and "maanantaisin, keskiviikkoisin ja perjantaisin" put the conjunction in
 * different places, and a hand-rolled join gets one of the five locales wrong.
 */
function joinDays(days: string[], locale: string): string {
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(days);
}

/** A spoken language's name in the reader's own locale — never a stored string. */
function languageNameOf(code: string, locale: string): string {
  return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
}

/**
 * The params as the builders take them: every value that needs a locale
 * formatted once, here, rather than twice in two places that can drift.
 */
export function resolveCalendarInvitation(
  params: CalendarInvitationParams,
  t: EmailTranslator,
  locale: string,
): CalendarInvitationContent {
  const weekdayNumbers = CALENDAR_INVITATION_WEEKDAYS[params.weekdays];
  const minutes = Number(params.durationMinutes);

  // A concrete instant, because a clock face cannot be converted without one:
  // the run's first day carries the offset actually in force at the start of
  // the run, which is what the reader is being told the sessions begin at.
  const start = fromZonedTime(
    `${params.startDate}T${params.startTime}:00`,
    params.timezone,
  );
  const end = new Date(start.getTime() + minutes * 60_000);

  return {
    ...params,
    weekdayNumbers,
    minutes,
    scheduleLine: t("calendarInvitation.schedule", {
      days: joinDays(weekdayNames(weekdayNumbers, locale), locale),
      time: formatTimeRange(start, end, locale, params.timezone),
    }),
    datesLine:
      params.endDate === null
        ? t("calendarInvitation.openEnded", {
            startDate: formatDateOnly(params.startDate, locale),
          })
        : formatDateRange(params.startDate, params.endDate, locale),
    languageName: languageNameOf(params.spokenLanguage, locale),
    typeName: t(`calendarInvitation.type.${params.productType}`),
    reminderMinutes: params.reminder === "none" ? null : Number(params.reminder),
    sequenceNumber: Number(params.sequence),
    // A fresh identity when the tester has not named one. Minted at render
    // rather than in the form's resolver, so a second message about the *same*
    // entry is deliberate: the tester types the first one's identifier back in.
    resolvedUid: params.uid ?? `${crypto.randomUUID()}@sogverse`,
  };
}

/** The label–value rows both the mail and the calendar description state. */
function facts(
  t: EmailTranslator,
  content: CalendarInvitationContent,
): [label: string, value: string][] {
  return [
    [t("calendarInvitation.typeLabel"), content.typeName],
    [t("calendarInvitation.scheduleLabel"), content.scheduleLine],
    [t("calendarInvitation.datesLabel"), content.datesLine],
    [
      t("calendarInvitation.whereLabel"),
      content.address ?? t("calendarInvitation.online"),
    ],
    // The role's own label, shared with the rest of the mail namespace rather
    // than restated here — one word for the role, everywhere.
    [t("roleGedu"), content.geduFirstName],
    [t("calendarInvitation.languageLabel"), content.languageName],
  ];
}

/**
 * The mail itself.
 *
 * The fact rows are the part a reader can act on without the attachment: a
 * client that renders the `.ics` as a file rather than as an invitation still
 * leaves them knowing which sessions, when, and where. The cancellation drops
 * everything that would read as an instruction — the description, how to get
 * there, the promise of future updates — and keeps only enough to say which
 * entry is going away.
 */
export function buildCalendarInvitationEmail(
  t: EmailTranslator,
  locale: string,
  content: CalendarInvitationContent,
): string {
  const cancelled = content.method === "cancel";
  const title = t(`calendarInvitation.heading.${content.method}`);

  const body = [
    heading(title),
    paragraph(t("calendarInvitation.greeting", { name: escapeHtml(content.parentFirstName) })),
    paragraph(
      t(`calendarInvitation.body.${content.method}`, {
        gamerName: styledName(content.gamerFirstName),
        productName: styledProductName(content.productName),
      }),
    ),
    factTable(facts(t, content).map(([label, value]) => [label, escapeHtml(value)])),
  ];

  if (!cancelled) {
    if (content.description !== null) body.push(paragraph(escapeHtml(content.description)));
    if (content.arrivalInstructions !== null) {
      body.push(
        sectionLabel(t("calendarInvitation.arrivalLabel")),
        paragraph(escapeHtml(content.arrivalInstructions)),
      );
    }
    body.push(paragraph(t("calendarInvitation.updatesNote")));
  }

  body.push(
    ctaButton({
      href: content.dashboardUrl,
      label: t("calendarInvitation.dashboardButton"),
    }),
  );

  return wrapInLayout({ title, content: body.join("\n"), locale, t });
}

/** The subject line, which has to say which of the three messages this is. */
export function calendarInvitationSubject(
  t: EmailTranslator,
  content: CalendarInvitationContent,
): string {
  return t(`calendarInvitation.subject.${content.method}`, {
    productName: content.productName,
    gamerName: content.gamerFirstName,
  });
}

/** The plain-text description a calendar client shows inside the entry. */
function calendarDescription(
  t: EmailTranslator,
  content: CalendarInvitationContent,
): string {
  const lines = facts(t, content).map(([label, value]) => `${label}: ${value}`);
  if (content.description !== null) lines.push("", content.description);
  if (content.arrivalInstructions !== null) {
    lines.push("", `${t("calendarInvitation.arrivalLabel")}: ${content.arrivalInstructions}`);
  }
  lines.push("", t("calendarInvitation.support", { email: SUPPORT_EMAIL }));
  return lines.join("\n");
}

/** The same content as HTML, for the clients that read `X-ALT-DESC`. */
function calendarHtmlDescription(
  t: EmailTranslator,
  content: CalendarInvitationContent,
): string {
  const rows = facts(t, content)
    .map(([label, value]) => `<li><strong>${escapeHtml(label)}</strong>: ${escapeHtml(value)}</li>`)
    .join("");
  // The arrival note keeps its label here as it does in the plain text: two
  // renderings of one description that say different things is the drift a
  // client silently picks a side in.
  const extras = [
    content.description === null ? null : escapeHtml(content.description),
    content.arrivalInstructions === null
      ? null
      : `<strong>${escapeHtml(t("calendarInvitation.arrivalLabel"))}</strong>: ${escapeHtml(
          content.arrivalInstructions,
        )}`,
  ]
    .filter((value): value is string => value !== null)
    .map((value) => `<p>${value}</p>`)
    .join("");
  return `<html><body><ul>${rows}</ul>${extras}<p>${escapeHtml(
    t("calendarInvitation.support", { email: SUPPORT_EMAIL }),
  )}</p></body></html>`;
}

/**
 * The `invite.ics` the mail carries.
 *
 * **The file name is load-bearing.** The provider infers the media type from
 * the extension, and `invite.ics` is what makes a client read the part as an
 * invitation rather than as a file to download — which is the difference
 * between an entry that can be updated in place and a copy nothing can find
 * again.
 *
 * A run with nothing left in it throws rather than sending an empty calendar: a
 * document describing no sessions still opens a conversation the reader's
 * calendar has no entry for. The message is written to be read by the admin
 * composing it, because the testing tool shows a render error verbatim.
 */
export function calendarInvitationAttachment(
  t: EmailTranslator,
  content: CalendarInvitationContent,
): RenderedAttachment {
  const built = buildInvitation({
    uid: content.resolvedUid,
    sequence: content.sequenceNumber,
    method: content.method,
    shape: content.shape,
    weekdays: content.weekdayNumbers,
    startDate: content.startDate,
    endDate: content.endDate,
    startTime: content.startTime,
    durationMinutes: content.minutes,
    timezone: content.timezone,
    summary: t("calendarInvitation.eventSummary", {
      productName: content.productName,
      gamerName: content.gamerFirstName,
    }),
    description: calendarDescription(t, content),
    htmlDescription: calendarHtmlDescription(t, content),
    location: content.address,
    url: content.dashboardUrl,
    organizer: { name: SENDER_NAME, email: SENDER_EMAIL },
    // A published entry asks nobody for an answer, so it names no attendee at
    // all; a request and its withdrawal are both addressed to somebody.
    attendee:
      content.method === "publish"
        ? null
        : { name: content.parentFirstName, email: content.parentEmail },
    reminderMinutes: content.reminderMinutes,
    now: new Date(),
  });

  if (!built.ok) {
    throw new Error(
      "This schedule has no sessions left ahead of now — check the start date, the end date and the weekdays.",
    );
  }

  return textAttachment("invite.ics", built.ics);
}
