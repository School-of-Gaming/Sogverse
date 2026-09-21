import { formatInTimeZone } from "date-fns-tz";
import { ROUTES } from "@/lib/constants";
import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  occurrenceOnDate,
  type SessionDateOccurrence,
} from "@/lib/session-date-occurrence";
import { formatDate, formatDateOnly } from "@/lib/utils";
import type {
  AdminOpenSubstitutionRequest,
  AdminResolvedSubstitution,
  AdminSubstitutionQueue,
} from "@/services/session-substitution";
import type {
  AdminSubstitutionsData,
  ResolvedSubstitution,
  SubstitutionOffer,
  SubstitutionRequest,
} from "./admin-substitutions-data";

/**
 * The Substitutions page's wire document, turned into what its body renders.
 *
 * **Day-granular except for two things, both of which genuinely tick.** A
 * session date is a calendar fact and an extract's date is one too; what moves
 * while the page sits open is how far away a session is and whether it is
 * inside the day that makes it urgent. Those are the two the shell re-runs on
 * the clock, and they are the reason this function takes `now` at all.
 *
 * **The occurrence is resolved from each request's own product**, from the
 * slots that travel with it, so the only absence left is "no slot names this
 * weekday" — the orphaned request — which reaches the row as `null` and renders
 * as a bare date rather than a time the schedule would not produce.
 */
export function buildAdminSubstitutionsData({
  queue,
  locale,
  viewerTimeZone,
  now,
}: {
  queue: AdminSubstitutionQueue;
  locale: SupportedLocale;
  viewerTimeZone: string;
  now: Date;
}): AdminSubstitutionsData {
  return {
    now,
    timeZoneAbbrev: viewerZoneAbbrev(queue, viewerTimeZone, locale, now),
    open: sortBySoonest(
      queue.open.map((request) => ({
        row: request,
        request: toSubstitutionRequest(request, locale, viewerTimeZone, now),
      })),
    ),
    recent: queue.recent.map((row) =>
      toResolvedSubstitution(row, locale, viewerTimeZone),
    ),
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
function sortBySoonest(
  rows: readonly { row: AdminOpenSubstitutionRequest; request: SubstitutionRequest }[],
): SubstitutionRequest[] {
  return [...rows]
    .sort((a, b) => sortKey(a) - sortKey(b))
    .map((entry) => entry.request);
}

/**
 * The instant a row sorts on: its own start, or midday UTC on its date when the
 * schedule no longer projects one.
 *
 * Midday rather than midnight so an orphan lands among the sessions of its own
 * day rather than ahead of all of them — the day is the only thing it can
 * honestly claim, and the middle of it is the least wrong place to say so.
 */
function sortKey(entry: {
  row: AdminOpenSubstitutionRequest;
  request: SubstitutionRequest;
}): number {
  const { startsAt } = entry.request;
  if (startsAt !== null) return startsAt.getTime();
  return new Date(`${entry.row.session_date}T12:00:00.000Z`).getTime();
}

/** One open request as the list renders it. */
function toSubstitutionRequest(
  request: AdminOpenSubstitutionRequest,
  locale: SupportedLocale,
  viewerTimeZone: string,
  now: Date,
): SubstitutionRequest {
  const occurrence = occurrenceFor(request);

  return {
    ...session(request, locale, viewerTimeZone, occurrence),
    id: request.id,
    startsAt: occurrence?.start ?? null,
    // Strictly in the future as well as within the day: a session that has
    // already begun is not something an admin can still staff, and shouting
    // about it would be shouting about the past.
    urgent:
      occurrence !== null &&
      occurrence.start.getTime() > now.getTime() &&
      occurrence.start.getTime() - now.getTime() <= URGENT_WITHIN_MS,
    offers: request.offers.map(
      (offer): SubstitutionOffer => ({
        id: offer.id,
        geduId: offer.gedu_id,
        name: personName(offer.first_name, offer.last_name),
        certified: offer.certified,
        criminalRecordCheckOn:
          offer.criminal_record_check_at === null
            ? null
            : formatDate(offer.criminal_record_check_at, locale, {
                dateStyle: "medium",
                timeZone: viewerTimeZone,
              }),
      }),
    ),
  };
}

/** One settled request as the fortnight list renders it. */
function toResolvedSubstitution(
  row: AdminResolvedSubstitution,
  locale: SupportedLocale,
  viewerTimeZone: string,
): ResolvedSubstitution {
  return {
    ...session(row, locale, viewerTimeZone, occurrenceFor(row)),
    id: row.id,
    substituteId: row.substitute_id,
    substituteName:
      row.substitute_first_name === null || row.substitute_last_name === null
        ? null
        : personName(row.substitute_first_name, row.substitute_last_name),
  };
}

/**
 * The session facts both halves of the page state, worded once.
 *
 * The two lists answer different questions and say the same things about the
 * session either way — which product, which group, which afternoon — so the
 * wording lives here rather than in each mapping, where the two would drift the
 * first time one of them gained a field.
 */
function session(
  row: AdminOpenSubstitutionRequest | AdminResolvedSubstitution,
  locale: SupportedLocale,
  viewerTimeZone: string,
  occurrence: SessionDateOccurrence | null,
) {
  return {
    groupId: row.group_id,
    groupName: row.group_name,
    productName: productName(row.product.translations, locale),
    productType: row.product.product_type,
    // A weekday beside the date, because what an admin is staffing is a
    // *session* and "Friday" is how the office talks about one; the year is
    // left off because both lists only ever hold dates inside a month of today.
    sessionDate: formatDateOnly(row.session_date, locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    }),
    sessionTime:
      occurrence === null ? null : clockFace(occurrence, viewerTimeZone),
    role: row.role,
    reason: row.reason,
    reasonNote: row.reason_note,
    requesterId: row.requested_by,
    requesterName: personName(
      row.requested_by_first_name,
      row.requested_by_last_name,
    ),
    groupHref: ROUTES.admin.productGroup(
      row.product.product_type,
      row.product.id,
      row.group_id,
    ),
  };
}

/** Where the session's own product puts it on its date, or `null` for an orphan. */
function occurrenceFor(
  row: AdminOpenSubstitutionRequest | AdminResolvedSubstitution,
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
  queue: AdminSubstitutionQueue,
  viewerTimeZone: string,
  locale: string,
  now: Date,
): string | null {
  const converts = [...queue.open, ...queue.recent].some(
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
