import { formatInTimeZone } from "date-fns-tz";
import { ROUTES } from "@/lib/constants";
import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  occurrenceOnDate,
  type SessionDateOccurrence,
} from "@/lib/session-date-occurrence";
import { formatDateOnly } from "@/lib/utils";
import type {
  AdminSubstitutionRequest,
  OpenAdminSubstitutionRequest,
  SubstitutedAdminSubstitutionRequest,
} from "@/services/session-substitution";
import type {
  AdminSubstitutionsData,
  SubstitutedSession,
  SubstitutionOffer,
  SubstitutionRequest,
  SubstitutionSession,
} from "./admin-substitutions-data";

/**
 * The Substitutions page's wire document, turned into what its body renders.
 *
 * **Day-granular except for two things, both of which genuinely tick.** A
 * session date is a calendar fact; what moves while the page sits open is how
 * far away a session is and whether it is inside the day that makes it urgent.
 * Those are the two the shell re-runs on the clock, and they are the reason
 * this function takes `now` at all.
 *
 * **The occurrence is resolved from each request's own product**, from the
 * slots that travel with it, so the only absence left is "no slot names this
 * weekday" — the orphaned request — which reaches the row as `null` and renders
 * under its day with no time, rather than a time the schedule would not produce.
 *
 * **One read, two lists.** The document carries open and substituted requests
 * together, and they are split here by status; both lists are sorted by the
 * same rule, and the zone line is asked of every row on the page.
 */
export function buildAdminSubstitutionsData({
  requests,
  locale,
  viewerTimeZone,
  now,
}: {
  requests: readonly AdminSubstitutionRequest[];
  locale: SupportedLocale;
  viewerTimeZone: string;
  now: Date;
}): AdminSubstitutionsData {
  const open: SubstitutionRequest[] = [];
  const substituted: SubstitutedSession[] = [];
  for (const row of requests) {
    if (row.status === "open") {
      open.push(toSubstitutionRequest(row, locale, viewerTimeZone, now));
    } else {
      substituted.push(toSubstitutedSession(row, locale, viewerTimeZone));
    }
  }

  return {
    now,
    timeZoneAbbrev: viewerZoneAbbrev(requests, viewerTimeZone, locale, now),
    open: sortBySoonest(open),
    substituted: sortBySoonest(substituted),
  };
}

/**
 * How far ahead a session has to be to stop being the next thing an admin
 * worries about.
 *
 * A day, because that is the horizon over which the office can still do
 * something about an unstaffed session: past it there is a working day left to
 * find somebody, inside it there is not. It is a presentation threshold and
 * nothing in the database knows it.
 */
const URGENT_WITHIN_MS = 24 * 60 * 60 * 1000;

/**
 * **Soonest session first**, which is not the order the read delivers.
 *
 * The read orders by calendar date, because a date is all SQL has — no instant
 * travels, on this surface or any other. Two products meeting on the same day
 * in two zones therefore arrive in an order that says nothing about which one
 * starts first, and an admin reading a queue top to bottom is reading it as a
 * run of deadlines. So the sort happens here, where the occurrences have been
 * resolved.
 *
 * **An orphan sorts on its date and never after everything else.** It has no
 * start, but it has a day, and the row is still work: parking every orphan at
 * the bottom would hide exactly the requests an admin has to clear by hand.
 * Ties — same instant, or two orphans on one date — keep the read's own order,
 * which is a stable sort's guarantee and is what makes this list not reshuffle
 * between two renders of the same document.
 */
function sortBySoonest<T extends SubstitutionSession>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => sortKey(a) - sortKey(b));
}

/**
 * The instant a row sorts on: its own start, or midday UTC on its date when the
 * schedule no longer projects one.
 *
 * Midday rather than midnight so an orphan lands among the sessions of its own
 * day rather than ahead of all of them — the day is the only thing it can
 * honestly claim, and the middle of it is the least wrong place to say so.
 */
function sortKey(session: SubstitutionSession): number {
  const { startsAt } = session;
  if (startsAt !== null) return startsAt.getTime();
  return new Date(`${session.sessionDay}T12:00:00.000Z`).getTime();
}

/** One open request as the queue renders it. */
function toSubstitutionRequest(
  request: OpenAdminSubstitutionRequest,
  locale: SupportedLocale,
  viewerTimeZone: string,
  now: Date,
): SubstitutionRequest {
  const session = toSubstitutionSession(request, locale, viewerTimeZone);
  const { startsAt } = session;

  return {
    ...session,
    // Strictly in the future as well as within the day: a session that has
    // already begun is not something an admin can still staff, and shouting
    // about it would be shouting about the past.
    urgent:
      startsAt !== null &&
      startsAt.getTime() > now.getTime() &&
      startsAt.getTime() - now.getTime() <= URGENT_WITHIN_MS,
    offers: request.offers.map(
      (offer): SubstitutionOffer => ({
        id: offer.id,
        geduId: offer.gedu_id,
        name: personName(offer.first_name, offer.last_name),
      }),
    ),
  };
}

/** One substituted request as the second section renders it. */
function toSubstitutedSession(
  request: SubstitutedAdminSubstitutionRequest,
  locale: SupportedLocale,
  viewerTimeZone: string,
): SubstitutedSession {
  return {
    ...toSubstitutionSession(request, locale, viewerTimeZone),
    substituteId: request.substitute_id,
    substituteName: personName(
      request.substitute_first_name,
      request.substitute_last_name,
    ),
    approvedAt: new Date(request.approved_at),
    approverFirstName: request.approved_by_first_name,
  };
}

/**
 * What both sections state about a session: which one, when, and whose seat.
 *
 * Urgency is not among them: it belongs to the open request alone, because it
 * marks a session still to staff, and a substituted session claims none since
 * there is nothing left to do about it.
 */
function toSubstitutionSession(
  request: AdminSubstitutionRequest,
  locale: SupportedLocale,
  viewerTimeZone: string,
): SubstitutionSession {
  const occurrence = occurrenceFor(request);

  return {
    id: request.id,
    groupId: request.group_id,
    groupName: request.group_name,
    productName: productName(request.product.translations, locale),
    productType: request.product.product_type,
    sessionDay: request.session_date,
    // A weekday beside the date, because what an admin is staffing is a
    // *session* and "Friday" is how the office talks about one; the year is
    // left off because the queue only ever holds dates from today forward
    // inside the schedule's own horizon.
    sessionDate: formatDateOnly(request.session_date, locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    }),
    sessionTime:
      occurrence === null ? null : clockFace(occurrence, viewerTimeZone),
    startsAt: occurrence?.start ?? null,
    role: request.role,
    reason: request.reason,
    reasonNote: request.reason_note,
    requesterId: request.requested_by,
    requesterName: personName(
      request.requested_by_first_name,
      request.requested_by_last_name,
    ),
    groupHref: ROUTES.admin.productGroup(
      request.product.product_type,
      request.product.id,
      request.group_id,
    ),
  };
}

/** Where the session's own product puts it on its date, or `null` for an orphan. */
function occurrenceFor(
  row: AdminSubstitutionRequest,
): SessionDateOccurrence | null {
  return occurrenceOnDate({
    sessionDate: row.session_date,
    slots: row.product.schedule_slots.map((slot) => ({
      weekday: slot.weekday,
      startTime: slot.start_time,
      durationMinutes: slot.duration_minutes,
    })),
    timezone: row.product.timezone,
  });
}

/**
 * One occurrence as a clock face: `HH:MM–HH:MM` in the viewer's zone.
 *
 * 24-hour and locale-blind, exactly as the admin schedule chips are — the times
 * on an admin surface are a column to be scanned rather than a sentence to be
 * read. The en dash is punctuation for the same reason the seat counts' slash
 * is: it reads identically in every locale and stays out of the catalog.
 *
 * Exported for the preview scene's fixtures, which resolve their own
 * occurrences and must word them the way the live mapping does.
 */
export function clockFace(
  occurrence: SessionDateOccurrence,
  viewerTimeZone: string,
): string {
  const start = formatInTimeZone(occurrence.start, viewerTimeZone, "HH:mm");
  const end = formatInTimeZone(occurrence.end, viewerTimeZone, "HH:mm");
  return `${start}–${end}`;
}

/**
 * The viewer's short zone abbreviation, or `null` when nothing converted.
 *
 * Asked of the products on this page rather than of a constant, because the
 * answer is about this document: an admin in Helsinki reading Helsinki products
 * is told nothing, and the moment one session is authored somewhere else the
 * whole page says which clock its times are on. Resolved at `now`, so the
 * abbreviation is the one currently in force (EET in winter, EEST in summer).
 */
function viewerZoneAbbrev(
  requests: readonly AdminSubstitutionRequest[],
  viewerTimeZone: string,
  locale: string,
  now: Date,
): string | null {
  const converts = requests.some(
    (row) => row.product.timezone !== viewerTimeZone,
  );
  if (!converts) return null;

  const part = new Intl.DateTimeFormat(locale, {
    timeZone: viewerTimeZone,
    timeZoneName: "short",
  })
    .formatToParts(now)
    .find((piece) => piece.type === "timeZoneName");
  return part?.value ?? null;
}

/**
 * A product's name in the reader's locale, through the admin surfaces' own
 * fallback chain (locale → English → whatever exists). Every product is
 * DB-guaranteed at least one translation, so the empty fallback is defensive.
 */
function productName(
  translations: readonly { locale: string; name: string }[],
  locale: SupportedLocale,
): string {
  return resolveTranslation(translations, locale)?.name ?? "";
}

/**
 * A person's display name, or `null` where the account carries none.
 *
 * The absence travels as `null` rather than as a stand-in string because the
 * stand-in is translated copy and this module has no locale for copy — only for
 * `Intl`.
 */
function personName(first: string, last: string): string | null {
  const name = [first, last].filter((part) => part.trim().length > 0).join(" ");
  return name.length > 0 ? name : null;
}
