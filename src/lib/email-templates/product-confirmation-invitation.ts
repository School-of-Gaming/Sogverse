import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  buildInvitation,
  type InvitationOverride,
  type InvitationRecurrence,
} from "@/lib/calendar-invitations/invitation";
import { SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import { GAME_PLATFORM_NAMES } from "@/lib/constants/game-platforms";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { platformForTopic } from "@/lib/products/topics";
import { formatDateOnly } from "@/lib/utils";
import type { ProductTopic, ProductType } from "@/types";
import type { EmailTranslator } from "./translator";

/**
 * The signup confirmation's calendar invitation — a product's schedule as one
 * iCalendar object, plus the sentences the mail and the document both state.
 *
 * **It lives here rather than beside the builder because it knows what a club
 * is.** `src/lib/calendar-invitations/` mirrors RFC 5545 and is deliberately
 * ignorant of products, seats and Gedus; this module is the other half of that
 * boundary — it reads a product's schedule and composes a family's invitation
 * from it, and it hands the builder a plain description of one calendar object.
 *
 * **Pure, and `now` is an argument.** No database, no request, no environment,
 * no clock of its own: which occurrence a `DTSTART` lands on is a function of
 * when the mail is composed, and a test that read the wall clock would be true
 * only on the day it was written. It also has to run in a browser bundle — the
 * template registry is imported by the admin testing page — so nothing here
 * touches `Buffer` or `server-only`.
 *
 * **Every sentence goes through the translator.** The reader is a parent, in
 * their own language, reading the document inside their calendar app weeks
 * later; the only strings that stay as they are are marks and content — the
 * product's own name and short description, the site's name, address and public
 * note, "My SOG", and the support address.
 */

/** One weekly slot, normalised: `0` = Monday … `6` = Sunday, `HH:MM`. */
export interface InvitationSlot {
  weekday: number;
  /** `HH:MM`, in the product's own zone. */
  startTime: string;
  durationMinutes: number;
}

export interface ProductConfirmationInvitationInput {
  /** The seat this invitation is for — one entry per participation. */
  participationId: string;
  /** The participant's first name; the buyer's own on a self seat. */
  participantName: string;
  isSelfSeat: boolean;
  productName: string;
  productType: ProductType;
  productTopic: ProductTopic;
  /** The product's own short description, in the reader's locale. */
  shortDescription: string | null;
  /** The IANA zone the product is authored in. */
  timezone: string;
  /** Product-local `YYYY-MM-DD`, or `null` on a product with no declared start. */
  startDate: string | null;
  /** Product-local `YYYY-MM-DD`, or `null` on an open-ended run. */
  endDate: string | null;
  slots: readonly InvitationSlot[];
  isRemote: boolean;
  /** The site's display name in the reader's locale, for an in-person product. */
  siteName: string | null;
  siteAddress: string | null;
  /** The FAMILY-facing site note — how to find the room, where to park. */
  siteNote: string | null;
  /** The paying parent: the mail's recipient, and the entry's one attendee. */
  attendeeName: string;
  attendeeEmail: string;
  /** Absolute link to this seat's enrollment page in My SOG. */
  enrollmentUrl: string;
  /** When the mail is being composed. */
  now: Date;
}

export interface ProductConfirmationInvitation {
  /** The object's identity — what a later update or cancellation must restate. */
  uid: string;
  ics: string;
  /**
   * The schedule in words: one line per distinct time, then the zone, then the
   * dates. The mail's own "Session times" section states these same lines, so
   * a parent reading the mail and a parent reading the calendar entry are given
   * one answer rather than two.
   */
  scheduleLines: string[];
  /** Where it happens — the same sentences, for the same reason. */
  placeLines: string[];
}

const DAY_MS = 86_400_000;

/**
 * How far past the floor the search for a first occurrence walks.
 *
 * Seven consecutive days cover every weekday, and the eighth is what makes the
 * floor day's own slot recoverable when its clock face has already gone by —
 * the same weekday comes round again exactly a week later. Anything beyond that
 * would mean the run has ended, which is a `null` rather than a longer walk.
 */
const FIRST_OCCURRENCE_SEARCH_DAYS = 8;

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

/** A product-local wall clock as the instant it names. */
function instantOf(date: string, time: string, timezone: string): Date {
  return fromZonedTime(`${date}T${time}:00`, timezone);
}

// --- The schedule, as the calendar has to state it ---

/** A slot's clock face and length, as one comparable key. */
function shapeOf(slot: InvitationSlot): string {
  return `${slot.startTime}|${slot.durationMinutes}`;
}

interface FirstOccurrence {
  date: string;
  slot: InvitationSlot;
}

/**
 * The first occurrence at or after `now` that is also on or after the run's
 * start — the invitation's `DTSTART`.
 *
 * **A signup after a club has begun must not put finished sessions in a
 * calendar**, which is the whole reason this is a search rather than the start
 * date. `RRULE` counts `DTSTART` as its first instance, so moving it forward
 * moves the whole run forward with it and nothing before today is ever stated.
 *
 * The walk is UTC-pinned calendar arithmetic over bare dates, and the only
 * instant it builds is the one it compares against `now` — which is what keeps
 * a daylight-saving transition inside the run from repeating or skipping a day.
 * The product's *own* zone decides which day "today" is, because the schedule is
 * a promise about clock faces in that zone.
 *
 * `null` means the run has nothing left: an ended product, or one whose
 * remaining days all fall past its end date.
 */
function findFirstOccurrence({
  slots,
  startDate,
  endDate,
  timezone,
  now,
}: {
  slots: readonly InvitationSlot[];
  startDate: string;
  endDate: string | null;
  timezone: string;
  now: Date;
}): FirstOccurrence | null {
  const today = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  // Bare-date string comparison is calendar comparison: the format is
  // fixed-width and zero-padded.
  const floor = parseDay(today > startDate ? today : startDate);

  for (let step = 0; step < FIRST_OCCURRENCE_SEARCH_DAYS; step++) {
    const day = floor + step * DAY_MS;
    const date = dayString(day);
    if (endDate !== null && date > endDate) return null;

    const weekday = weekdayOf(day);
    const candidates = slots
      .filter((slot) => slot.weekday === weekday)
      .filter(
        (slot) => instantOf(date, slot.startTime, timezone).getTime() >= now.getTime(),
      )
      // Earliest clock face first: every candidate is on the same day, so the
      // earliest start time is the earliest instant.
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    if (candidates.length > 0) return { date, slot: candidates[0] };
  }
  return null;
}

/**
 * Every occurrence of a slot whose time or length disagrees with the master's,
 * as the overrides that state them.
 *
 * A mixed-time camp — several days, each with its own start and end — cannot be
 * one `RRULE`, because a rule states one clock face. RFC 5545's answer is an
 * extra component per disagreeing occurrence under the same identifier, and
 * that is what this walks out: from `DTSTART` to the run's last day inclusive,
 * one entry per day whose slot is not the master's shape.
 *
 * The walk is bounded by the end date, which is why the caller refuses a
 * mixed-time run that has none: there would be no last day to stop writing
 * overrides at.
 */
function overridesFor({
  slots,
  fromDate,
  endDate,
  masterShape,
}: {
  slots: readonly InvitationSlot[];
  fromDate: string;
  endDate: string;
  masterShape: string;
}): InvitationOverride[] {
  const byWeekday = new Map(slots.map((slot) => [slot.weekday, slot]));
  const overrides: InvitationOverride[] = [];
  const last = parseDay(endDate);

  for (let day = parseDay(fromDate); day <= last; day += DAY_MS) {
    const slot = byWeekday.get(weekdayOf(day));
    if (!slot || shapeOf(slot) === masterShape) continue;
    overrides.push({
      date: dayString(day),
      time: slot.startTime,
      durationMinutes: slot.durationMinutes,
    });
  }
  return overrides;
}

interface ResolvedSchedule {
  start: { date: string; time: string };
  durationMinutes: number;
  recurrence: InvitationRecurrence;
  overrides: InvitationOverride[];
}

/**
 * A product's stored schedule as the one calendar object that states it, or
 * `null` where no such object exists.
 *
 * Five shapes answer `null`, and each of them is a real product rather than a
 * fault: no slots at all, no start date, an event whose slots name no session
 * on its own start date, a run with no occurrence still ahead, and the one
 * shape RFC 5545 cannot express under a single identifier — a mixed-time run
 * with no last day. The caller sends the plain mail for all five.
 */
function resolveSchedule({
  slots,
  productType,
  startDate,
  endDate,
  timezone,
  now,
}: {
  slots: readonly InvitationSlot[];
  productType: ProductType;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  now: Date;
}): ResolvedSchedule | null {
  if (slots.length === 0 || startDate === null) return null;

  // An event is one session on one day: the rule that would state it has
  // nothing to repeat, so the occurrence is the start date at the clock face of
  // whichever slot falls on that weekday. A schedule naming no slot there
  // describes no session at all, which is a product with a date and nothing on
  // it rather than a document to send.
  if (productType === "event") {
    const weekday = weekdayOf(parseDay(startDate));
    const onTheDay = [...slots]
      .filter((candidate) => candidate.weekday === weekday)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (onTheDay.length === 0) return null;
    const slot = onTheDay[0];
    if (instantOf(startDate, slot.startTime, timezone).getTime() < now.getTime()) {
      return null;
    }
    return {
      start: { date: startDate, time: slot.startTime },
      durationMinutes: slot.durationMinutes,
      recurrence: { kind: "none" },
      overrides: [],
    };
  }

  const first = findFirstOccurrence({ slots, startDate, endDate, timezone, now });
  if (first === null) return null;

  const recurrence: InvitationRecurrence = {
    kind: "weekly",
    weekdays: [...new Set(slots.map((slot) => slot.weekday))].sort((a, b) => a - b),
    interval: 1,
    // An open-ended consumer club states no last day, which is the honest
    // answer: the family's seat renews until somebody cancels it.
    until: endDate,
    count: null,
    // Nothing is excluded. A cancelled session is not a thing the schedule
    // knows about, and inventing an EXDATE from anything else would state a
    // fact the product does not hold.
  };

  const shapes = new Set(slots.map(shapeOf));
  const masterShape = shapeOf(first.slot);

  if (shapes.size > 1) {
    // Two slots on one weekday at different times cannot both be stated: the
    // rule produces one occurrence per weekday, and a `RECURRENCE-ID` names an
    // occurrence rather than a session. It is not a shape the admin form can
    // produce — a camp names each day once — so the answer is no invitation
    // rather than an invitation missing a session nobody would notice.
    const perWeekday = new Map<number, string>();
    for (const slot of slots) {
      const seen = perWeekday.get(slot.weekday);
      if (seen !== undefined && seen !== shapeOf(slot)) return null;
      perWeekday.set(slot.weekday, shapeOf(slot));
    }
    // And an unbounded run at two clock faces has no last day to stop writing
    // overrides at. It is not creatable today — a consumer club is the only
    // product without an end date and its form gives it one slot — and the
    // right answer if it ever becomes creatable is one series per distinct
    // time under its own identifier, which is a different document.
    if (endDate === null) return null;
  }

  return {
    start: { date: first.date, time: first.slot.startTime },
    durationMinutes: first.slot.durationMinutes,
    recurrence,
    overrides:
      shapes.size > 1 && endDate !== null
        ? overridesFor({ slots, fromDate: first.date, endDate, masterShape })
        : [],
  };
}

// --- The words ---

/**
 * A weekday's name in the reader's language.
 *
 * 2024-01-01 was a Monday, so a UTC-pinned walk from it lands index `0` on
 * Monday — the app's own weekday convention. `Intl` rather than a message key:
 * weekday names are data every locale already has, and a translated list of
 * seven would be seven more strings to keep correct in five files.
 */
function weekdayName(locale: string, weekday: number): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2024, 0, 1 + weekday)));
}

/**
 * A clock face in the reader's language — `16:00` in English, `16.00` in
 * Finnish.
 *
 * It is a wall clock rather than an instant, so it is formatted from a
 * UTC-pinned time of day and carries no zone: the zone is stated once, on its
 * own line, rather than repeated after every time.
 *
 * `hour12: false` is pinned rather than left to the locale, exactly as the seat
 * offer's deadline is: `en` would otherwise set this as "04:00 PM" while every
 * in-app surface stating the same schedule sets it as "16:00", and a family
 * comparing a mail against My SOG should not have to convert.
 */
function formatClock(locale: string, minutesOfDay: number): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(1970, 0, 1, 0, minutesOfDay)));
}

/** `HH:MM` as minutes past midnight. */
function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * The zone's own name, in the reader's language, at the instant the run starts.
 *
 * Read from `Intl` rather than from a message file: a zone name is data every
 * locale has, and the reading depends on the date — the same zone is "Eastern
 * European Standard Time" in January and its summer name in July — so it has to
 * be resolved against a concrete instant rather than written down.
 */
function zoneName(locale: string, timezone: string, at: Date): string {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    timeZoneName: "long",
  }).formatToParts(at);
  return parts.find((part) => part.type === "timeZoneName")?.value ?? timezone;
}

/**
 * The schedule in words: one line per distinct time, then the zone, then the
 * dates the run covers.
 *
 * Grouped by clock face rather than listed per weekday, because "Every Monday
 * and Wednesday, 16:00–17:00" is one fact and two lines saying the same times
 * on different days is two facts a reader has to compare. A mixed-time camp
 * gets one line per time, which is exactly the difference worth showing.
 */
function scheduleInWords({
  t,
  locale,
  slots,
  productType,
  timezone,
  startDate,
  endDate,
  firstInstant,
}: {
  t: EmailTranslator;
  locale: string;
  slots: readonly InvitationSlot[];
  productType: ProductType;
  timezone: string;
  startDate: string;
  endDate: string | null;
  firstInstant: Date;
}): string[] {
  const byShape = new Map<string, InvitationSlot[]>();
  for (const slot of [...slots].sort((a, b) => a.weekday - b.weekday)) {
    const existing = byShape.get(shapeOf(slot));
    if (existing) existing.push(slot);
    else byShape.set(shapeOf(slot), [slot]);
  }

  const lines = [...byShape.values()].map((group) => {
    const start = minutesOf(group[0].startTime);
    const times = {
      startTime: formatClock(locale, start),
      endTime: formatClock(locale, start + group[0].durationMinutes),
    };
    // An event happens once, so naming its weekday would be stating the date
    // twice — the date line below already says which day it is.
    if (productType === "event") return t("productConfirmation.invite.scheduleOnce", times);
    return t("productConfirmation.invite.scheduleWeekly", {
      ...times,
      days: new Intl.ListFormat(locale, {
        style: "long",
        type: "conjunction",
      }).format(group.map((slot) => weekdayName(locale, slot.weekday))),
    });
  });

  lines.push(
    t("productConfirmation.invite.zoneNote", {
      zone: zoneName(locale, timezone, firstInstant),
    }),
  );

  // The dates are bare calendar dates with no clock face, so they are read and
  // rendered UTC-pinned — re-anchoring one to anybody's zone would shift it off
  // by a day.
  const from = formatDateOnly(startDate, locale, { dateStyle: "long" });
  if (productType === "event") {
    lines.push(t("productConfirmation.invite.dateOn", { date: from }));
  } else if (endDate === null) {
    lines.push(t("productConfirmation.invite.dateFrom", { startDate: from }));
  } else {
    lines.push(
      t("productConfirmation.invite.dateRange", {
        startDate: from,
        endDate: formatDateOnly(endDate, locale, { dateStyle: "long" }),
      }),
    );
  }

  return lines;
}

/** Where the sessions happen — online, or at a named site with its own note. */
function placeInWords({
  t,
  isRemote,
  siteName,
  siteAddress,
  siteNote,
}: {
  t: EmailTranslator;
  isRemote: boolean;
  siteName: string | null;
  siteAddress: string | null;
  siteNote: string | null;
}): string[] {
  if (isRemote) {
    return [
      t("productConfirmation.invite.whereOnline", {
        // Interpolated from the constant the voice room itself reads, never
        // typed: the two would drift the first time the window moved, and the
        // mail is the copy a parent plans around.
        minutes: VOICE_CONFIG.SESSION_WINDOW_BEFORE_MINUTES,
      }),
    ];
  }

  const lines: string[] = [];
  if (siteName) lines.push(t("productConfirmation.invite.whereInPerson", { site: siteName }));
  if (siteAddress) {
    lines.push(t("productConfirmation.invite.whereAddress", { address: siteAddress }));
  }
  // The public site note is where "the door on the north side, ring the bell"
  // lives. It is admin-authored content rather than copy, so it travels
  // verbatim in whatever language it was written in.
  if (siteNote) lines.push(siteNote);
  return lines;
}

/**
 * The entry's title.
 *
 * A child's seat names the child, because a parent's calendar holds more than
 * one of these and "Minecraft 101" twice over says nothing about who is going.
 * A parent's own seat names nobody: they are the participant, and reading their
 * own name back at them is the shape of an entry about somebody else.
 */
function summaryOf(
  t: EmailTranslator,
  { isSelfSeat, productName, participantName }: {
    isSelfSeat: boolean;
    productName: string;
    participantName: string;
  },
): string {
  return isSelfSeat
    ? productName
    : t("productConfirmation.invite.summary", { productName, participantName });
}

/** The `LOCATION` property: a site and its address, or the online answer. */
function locationOf(
  t: EmailTranslator,
  { isRemote, siteName, siteAddress }: {
    isRemote: boolean;
    siteName: string | null;
    siteAddress: string | null;
  },
): string {
  if (isRemote) return t("productConfirmation.invite.locationOnline");
  if (!siteName) return "";
  return siteAddress
    ? t("productConfirmation.invite.locationInPerson", {
        site: siteName,
        address: siteAddress,
      })
    : siteName;
}

/**
 * The `DESCRIPTION`: what the entry says when a parent opens it in their
 * calendar, weeks after the mail it arrived in has been archived.
 *
 * Plain text, in the reader's locale, paragraphs separated by blank lines — the
 * builder escapes it, so there is no markup here and none would survive. What
 * is deliberately absent is money and the age range: an entry in a calendar is
 * read by whoever the calendar is shared with, and neither is theirs.
 */
function descriptionOf({
  t,
  input,
  scheduleLines,
  placeLines,
}: {
  t: EmailTranslator;
  input: ProductConfirmationInvitationInput;
  scheduleLines: string[];
  placeLines: string[];
}): string {
  const {
    isSelfSeat,
    participantName,
    productName,
    productType,
    productTopic,
    shortDescription,
    enrollmentUrl,
  } = input;

  const paragraphs = [
    // The mail's own opening sentence, in the same words: a parent who reads
    // the entry and a parent who reads the mail have been told one thing.
    isSelfSeat
      ? t(`productConfirmation.self.subheading.${productType}`, { productName })
      : t(`productConfirmation.subheading.${productType}`, {
          participantName,
          productName,
        }),
  ];

  if (shortDescription?.trim()) paragraphs.push(shortDescription.trim());

  paragraphs.push(scheduleLines.join("\n"));
  if (placeLines.length > 0) paragraphs.push(placeLines.join("\n"));

  paragraphs.push(
    isSelfSeat
      ? t("productConfirmation.next.placementSelf")
      : t("productConfirmation.next.placement", { participantName }),
  );

  // Only where the product is about one game account a child actually holds.
  // Most topics are about no single account — subject matter, or a game we
  // store no identity for — and a reminder to link one there would be asking a
  // parent for something that does not exist.
  const platform = platformForTopic(productTopic);
  if (platform !== null) {
    const game = GAME_PLATFORM_NAMES[platform];
    paragraphs.push(
      isSelfSeat
        ? t("productConfirmation.invite.gameAccountSelf", { game })
        : t("productConfirmation.invite.gameAccount", { game, participantName }),
    );
  }

  paragraphs.push(
    t("productConfirmation.invite.link", { url: enrollmentUrl }),
    t("productConfirmation.invite.questions", { supportEmail: SUPPORT_EMAIL }),
  );

  return paragraphs.join("\n\n");
}

/**
 * The whole invitation, or `null` where the product's schedule states no
 * calendar object at all.
 *
 * **`null` is silence, not an error.** Every shape behind it is a product a
 * family can legitimately sign up to — one with no schedule yet, one that has
 * finished, a waitlist join with no seat behind it — and the mail those
 * families get is the mail this feature replaced, with nothing attached and no
 * session-times section. A confirmation that failed because a calendar could
 * not be composed would be the wrong thing to break.
 *
 * **The identifier is derived from the participation, and that is what makes an
 * update possible later.** One entry per seat, so two children in one club are
 * two events in the parent's calendar rather than one they cannot tell apart.
 * Sending a change or a cancellation is out of scope here — but it is the same
 * identifier with a higher `SEQUENCE` and a `METHOD` of `REQUEST` or `CANCEL`,
 * which is exactly why the identifier is a function of the row rather than
 * minted per render.
 */
export function composeProductConfirmationInvitation(
  t: EmailTranslator,
  locale: string,
  input: ProductConfirmationInvitationInput,
): ProductConfirmationInvitation | null {
  const schedule = resolveSchedule({
    slots: input.slots,
    productType: input.productType,
    startDate: input.startDate,
    endDate: input.endDate,
    timezone: input.timezone,
    now: input.now,
  });
  if (schedule === null || input.startDate === null) return null;

  const scheduleLines = scheduleInWords({
    t,
    locale,
    slots: input.slots,
    productType: input.productType,
    timezone: input.timezone,
    startDate: input.startDate,
    endDate: input.endDate,
    firstInstant: instantOf(schedule.start.date, schedule.start.time, input.timezone),
  });
  const placeLines = placeInWords({
    t,
    isRemote: input.isRemote,
    siteName: input.siteName,
    siteAddress: input.siteAddress,
    siteNote: input.siteNote,
  });

  const uid = `${input.participationId}@sogverse`;

  const built = buildInvitation({
    uid,
    // The first message about this object. An update states the same
    // identifier with a higher number; nothing sends one yet.
    sequence: 0,
    // It asks the family to answer, and it names them as the one being asked.
    method: "request",
    status: "confirmed",

    timezone: input.timezone,
    // A wall clock under a TZID, never an instant: what the schedule promises
    // is a clock face, and a session at 16:00 stays at 16:00 across the two
    // days a year the offset moves.
    timeForm: "tzid",
    allDay: false,
    start: schedule.start,
    durationMinutes: schedule.durationMinutes,
    recurrence: schedule.recurrence,
    excludedDates: [],
    overrides: schedule.overrides,

    // The support inbox, not the unattended sending address: an RSVP is a
    // reply, and a reply about a child's seat has to reach somebody.
    organizer: { name: SENDER_NAME, email: SUPPORT_EMAIL },
    // The paying parent, and only ever them. A gamer's address is a synthetic
    // internal one that no mail can reach, so naming a child as an attendee
    // would be inviting a mailbox that does not exist.
    attendee: {
      name: input.attendeeName,
      email: input.attendeeEmail,
      role: "REQ-PARTICIPANT",
      partstat: "NEEDS-ACTION",
      rsvp: true,
    },

    summary: summaryOf(t, input),
    description: descriptionOf({ t, input, scheduleLines, placeLines }),
    location: locationOf(t, input),
    url: input.enrollmentUrl,

    // A day before, then an hour before, **in that order and for that
    // reason**: an Exchange mailbox keeps exactly one alarm per item and keeps
    // the first, so the reminder that has to survive is the one a parent can
    // still act on — the day before is when a session is fitted around
    // everything else.
    alarms: [
      { minutesBefore: 1440, action: "display", anchor: "start" },
      { minutesBefore: 60, action: "display", anchor: "start" },
    ],
    // No email alarm is written, so nothing reads this; it is the attendee's
    // address because that is the only one the document knows.
    alarmEmail: input.attendeeEmail,

    // The child is somewhere for that hour and the parent is not free to book
    // over it — a session that showed as free is a session a dentist
    // appointment lands on top of.
    showAs: "busy",

    now: input.now,
  });

  if (!built.ok) return null;

  return { uid, ics: built.ics, scheduleLines, placeLines };
}
