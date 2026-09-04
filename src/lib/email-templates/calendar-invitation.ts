import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { SENDER_EMAIL, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { DEFAULT_TIMEZONE } from "@/lib/constants/locales";
import { formatDateOnly, formatDateRange, formatTimeRange } from "@/lib/utils";
import {
  buildInvitation,
  type InvitationMethod,
  type InvitationShape,
  type InvitationShowAs,
} from "@/lib/calendar-invitations/invitation";
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
 *
 * **It is also the one mail that owes a plain-text body.** An Exchange mailbox
 * fills the calendar entry's own notes from the message body and, with only
 * HTML to work from, flattens the markup into them — so the text here is the
 * mail's words rather than a stripped copy of its markup, and it is what a
 * Microsoft reader finds inside the entry weeks later.
 *
 * **One resolution per render.** The identifier is minted where the schedule is
 * turned into a document, and the mail, the file and the copy the admin reads
 * back all state the one that resolution produced.
 */

export const CALENDAR_INVITATION_METHODS = ["request", "publish", "cancel"] as const;
export const CALENDAR_INVITATION_SHAPES = ["rule", "list"] as const;

/**
 * The kinds of product a family recognises, which is a display axis rather than
 * the database's own list: the schema's two club types are one word to a parent
 * reading a mail, so they are folded into "club" here and the enum is not the
 * source. Deriving this from codegen would put a column name in a fact row.
 */
export const CALENDAR_INVITATION_PRODUCT_TYPES = ["club", "camp", "event"] as const;

/**
 * The reminder offsets the form offers, in the order it lists them — an
 * untouched select posts its first option, so the order is the default.
 */
export const CALENDAR_INVITATION_REMINDERS = ["15", "60", "1440", "none"] as const;

/**
 * The same offsets, ordered for the second reminder, which defaults to a day
 * ahead. Two fields rather than one because a mail carries two alarms and their
 * *order* decides what a Microsoft mailbox shows: Exchange keeps one alarm per
 * item and keeps the first.
 */
export const CALENDAR_INVITATION_SECOND_REMINDERS = ["1440", "15", "60", "none"] as const;

/** Whether the entry blocks the reader's own time. Free is the default. */
export const CALENDAR_INVITATION_SHOW_AS = ["free", "busy"] as const;

/**
 * The zones a schedule can be authored in, for the tool.
 *
 * Helsinki first because it is where every product we run is authored and the
 * one zone the writer ships transition rules for. Stockholm and Paris are here
 * so the note a document states about a zone it cannot describe can be seen,
 * and UTC so the third case can: a document whose times are absolute instants,
 * naming no zone and needing none described.
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
  /** The alarm the reader should get if their calendar keeps only one. */
  reminderFirst: (typeof CALENDAR_INVITATION_REMINDERS)[number];
  reminderSecond: (typeof CALENDAR_INVITATION_REMINDERS)[number];
  showAs: InvitationShowAs;
  method: InvitationMethod;
  shape: InvitationShape;
  /** `null` mints a fresh one at render — a thread's second message types the first one's. */
  uid: string | null;
  sequence: string;
  dashboardUrl: string;
}

/** The params with every locale-aware value already formatted. */
export interface CalendarInvitationContent extends CalendarInvitationParams {
  weekdayNumbers: number[];
  /** "Monday, Wednesday and Friday at 16:00 – 18:00 GMT+3", in the reader's locale. */
  scheduleLine: string;
  datesLine: string;
  languageName: string;
  typeName: string;
  minutes: number;
  /** The alarm offsets, in the order the document emits them. */
  reminderMinutes: number[];
  sequenceNumber: number;
  resolvedUid: string;
  /** The calendar document itself, composed once per render. */
  ics: string;
  /** Whether the document stops at the twelve-week horizon rather than at the run's end. */
  truncated: boolean;
}

/**
 * Everything resolved except the document itself — what the calendar's own
 * summary and description are composed from, and therefore what has to exist
 * before it can be built.
 */
type CalendarInvitationFacts = Omit<CalendarInvitationContent, "ics" | "truncated">;

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
  const facts = resolveFacts(params, t, locale);
  const built = composeInvitation(t, facts);
  return { ...facts, ics: built.ics, truncated: built.truncated };
}

/**
 * The locale-aware half of a resolution: every value formatted once, here,
 * rather than twice in two places that can drift.
 */
function resolveFacts(
  params: CalendarInvitationParams,
  t: EmailTranslator,
  locale: string,
): CalendarInvitationFacts {
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
    // Order is the field, not a set: Exchange keeps the first alarm and drops
    // the rest, so the one that matters is written first.
    reminderMinutes: [params.reminderFirst, params.reminderSecond]
      .filter((value) => value !== "none")
      .map(Number),
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
  content: CalendarInvitationFacts,
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
 * Which sentence the mail opens with.
 *
 * The request and the published entry both claim to hold every session still
 * ahead, and an explicit date list stopping at the twelve-week horizon does
 * not — so those two have a second wording that says how far the entry reaches
 * instead. The cancellation has neither: it says an entry is going away, which
 * is true whatever the notation covered, and giving it a horizon variant would
 * be two identical strings in five locales.
 */
type CalendarInvitationBodyKey =
  | `calendarInvitation.body.${InvitationMethod}`
  | `calendarInvitation.bodyHorizon.${"request" | "publish"}`;

function bodyKey(content: CalendarInvitationContent): CalendarInvitationBodyKey {
  if (content.method === "cancel") return "calendarInvitation.body.cancel";
  return content.truncated
    ? `calendarInvitation.bodyHorizon.${content.method}`
    : `calendarInvitation.body.${content.method}`;
}

/**
 * The mail itself.
 *
 * The fact rows are the part a reader can act on without the attachment: a
 * client that renders the `.ics` as a file rather than as an invitation still
 * leaves them knowing which sessions, when, and where. The cancellation drops
 * everything that would read as an instruction — the description, how to get
 * there — and keeps only enough to say which entry is going away.
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
      t(bodyKey(content), {
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
  }

  body.push(
    ctaButton({
      href: content.dashboardUrl,
      label: t("calendarInvitation.dashboardButton"),
    }),
  );

  return wrapInLayout({ title, content: body.join("\n"), locale, t });
}

/**
 * The same mail as plain text.
 *
 * **This is not a courtesy fallback — on a Microsoft mailbox it is the calendar
 * entry's notes.** Exchange fills the entry from the message body, and when the
 * only body is HTML it flattens that instead: the reader opens the session in
 * their calendar and finds the mail's markup rendered as text, tracking pixel
 * and all. So the text is written as the mail's own words rather than as a
 * stripped copy of the markup — the greeting, the sentence that says what this
 * is, the facts, how to get there, the link as a bare URL, and where to write
 * with a question.
 */
export function calendarInvitationText(
  t: EmailTranslator,
  content: CalendarInvitationContent,
): string {
  const lines = [
    t("calendarInvitation.greeting", { name: content.parentFirstName }),
    "",
    t(bodyKey(content), {
      gamerName: content.gamerFirstName,
      productName: content.productName,
    }),
    "",
    ...facts(t, content).map(([label, value]) => `${label}: ${value}`),
  ];

  if (content.method !== "cancel") {
    if (content.description !== null) lines.push("", content.description);
    if (content.arrivalInstructions !== null) {
      lines.push(
        "",
        `${t("calendarInvitation.arrivalLabel")}: ${content.arrivalInstructions}`,
      );
    }
  }

  lines.push(
    "",
    // The button, as the only thing a text part can make of one: its label and
    // the address behind it. A client linkifies the bare URL on its own.
    `${t("calendarInvitation.dashboardButton")}: ${content.dashboardUrl}`,
    "",
    t("calendarInvitation.support", { email: SUPPORT_EMAIL }),
    "",
    // The shell's own closing line, which is where the HTML mail signs off.
    t("footer", { year: String(new Date().getFullYear()) }),
  );

  return lines.join("\n");
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
  content: CalendarInvitationFacts,
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
  content: CalendarInvitationFacts,
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
 * The calendar document, composed once per render.
 *
 * **Once is the point.** The identifier is minted here when the form names
 * none, and every part of the render that carries it — the file the reader
 * gets, the copy the admin reads back — has to carry the *same* one, or there
 * is no way to send an update against what was sent. So the document is built
 * inside the resolution rather than beside it, and everything downstream reads
 * the string it produced.
 *
 * A run with nothing left in it throws rather than composing an empty calendar:
 * a document describing no sessions still opens a conversation the reader's
 * calendar has no entry for. The message is written to be read by the admin
 * composing it — the testing tool shows a render error verbatim, and the send
 * route answers with it.
 */
function composeInvitation(
  t: EmailTranslator,
  content: CalendarInvitationFacts,
): { ics: string; truncated: boolean } {
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
    showAs: content.showAs,
    reminderMinutes: content.reminderMinutes,
    now: new Date(),
  });

  if (!built.ok) {
    throw new Error(
      "This schedule has no sessions left ahead of now — check the start date, the end date and the weekdays.",
    );
  }

  return { ics: built.ics, truncated: built.truncated };
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
