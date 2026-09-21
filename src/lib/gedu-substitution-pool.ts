import { fromZonedTime } from "date-fns-tz";
import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { occurrenceOnDate } from "@/lib/session-date-occurrence";
import type { OpenSubstitutionRequest } from "@/services/session-substitution";
import type {
  GeduAssignmentRole,
  ProductTopic,
  ProductType,
  SpokenLanguageCode,
} from "@/types";

/**
 * The pool a certified gedu picks a substitution out of — the wire rows turned into
 * what one card of it actually shows.
 *
 * **The calendar maths is here because it is not in SQL.** The read emits the
 * date plus the product's slots and timezone, exactly as both session feeds do,
 * and there is one schedule expansion in this codebase and it is on the client.
 * So this module is where a bare `YYYY-MM-DD` becomes the instants a reader is
 * shown in their own zone.
 *
 * **What is deliberately not here is the absent gedu.** The read does not name
 * them and never will: naming the person half-reveals a private reason —
 * everybody knows who is off sick — and the seat being substituted belongs to the
 * group rather than to somebody the volunteer needs to know about. What a
 * volunteer decides on is the session: when it is, where, what it is about,
 * which language, and what the role pays.
 *
 * Pure, and clock-free. Whether a request is still worth offering on is the
 * database's answer — it returns open requests dated today or later inside a
 * sixty-day window — and a second filter here would be the page disagreeing
 * with the write it is about to make.
 */

/** One offerable session, in the shape the section renders it. */
export interface SubstitutionPoolRow {
  requestId: string;
  groupId: string;
  groupName: string;
  /** Product-local `YYYY-MM-DD`, kept because it is the row's own identity. */
  sessionDate: string;
  /**
   * When the substituted session runs, or `null` where the schedule no longer
   * projects that weekday — an orphaned request, which the queue still carries
   * because it orders by date and never by a derived instant.
   */
  startsAt: Date | null;
  endsAt: Date | null;
  /** The product's own zone, which `sessionDate` is a date in. */
  timezone: string;
  /** Translated, in the viewer's locale, exactly as a card resolves one. */
  productName: string;
  productType: ProductType;
  topic: ProductTopic;
  spokenLanguageCode: SpokenLanguageCode;
  isRemote: boolean;
  /** The venue on an in-person product; `null` on a remote one. */
  siteName: string | null;
  /** The role being substituted — the absent gedu's, never the volunteer's. */
  role: GeduAssignmentRole;
  /**
   * What this role pays per session, or `null` where the product has not set
   * one. A blank fee is a blank field rather than a volunteer session, and
   * nothing flags it — which is the existing treatment of a missing assistant
   * fee.
   */
  feeCents: number | null;
  /** Whether the caller has already offered — the button's two resting states. */
  hasOffered: boolean;
}

/**
 * How close a session has to be before the page marks it out — the boundary
 * between "this is coming up" and "this is about to happen with nobody in the
 * room".
 *
 * A day, because that is the horizon a gedu can still rearrange an evening
 * inside. It is stated here rather than in the card so the emphasis and the test
 * that pins it read one number.
 */
export const SUBSTITUTION_URGENT_WITHIN_MS = 24 * 60 * 60 * 1000;

/**
 * Whether this request is the urgent kind: it starts inside the next day, or it
 * has started already.
 *
 * A session already under way is *more* urgent rather than less, so the test is
 * one-sided — anything below the threshold qualifies, including a negative gap.
 * An orphaned row has no start at all and is never urgent: there is no session
 * the schedule still projects to be late for.
 */
export function isSubstitutionUrgent(
  row: Pick<SubstitutionPoolRow, "startsAt">,
  now: Date,
): boolean {
  if (row.startsAt === null) return false;
  return row.startsAt.getTime() - now.getTime() < SUBSTITUTION_URGENT_WITHIN_MS;
}

/**
 * The instant a row is ordered by: when its session starts, or — for a date the
 * schedule no longer projects — the last moment of that day in the product's own
 * zone.
 *
 * The orphan has no start to be ordered against, and the end of its day is the
 * only honest place for it: it is somewhere on that date, so it sorts after
 * every session that day whose time is known and before the next day's.
 */
function poolSortInstant(row: SubstitutionPoolRow): number {
  if (row.startsAt !== null) return row.startsAt.getTime();
  return fromZonedTime(
    `${row.sessionDate}T23:59:59.999`,
    row.timezone,
  ).getTime();
}

/**
 * The pool in the order the page reads it: **soonest session first**, because
 * the sooner a session is the less time is left to find anybody for it.
 *
 * It is a total order rather than a sort with ties left to chance — the request
 * id breaks them — so a refetch that returns the same rows cannot reshuffle the
 * grid under a reader's pointer. Pure, and clock-free: what makes a row urgent
 * is a question for the moment of render, and it is asked separately.
 */
export function sortSubstitutionPoolRows(
  rows: readonly SubstitutionPoolRow[],
): SubstitutionPoolRow[] {
  return [...rows].sort((a, b) => {
    const byMoment = poolSortInstant(a) - poolSortInstant(b);
    if (byMoment !== 0) return byMoment;
    return a.requestId < b.requestId ? -1 : a.requestId > b.requestId ? 1 : 0;
  });
}

/**
 * Shape the pool rows for one viewer, **soonest session first**.
 *
 * The read hands them over by date and then by product, which is the queue's own
 * order and was what the dashboard's list rendered. The page that replaced it is
 * read for urgency rather than as a queue, so the order it wants is by the
 * instant a session starts — a Tuesday morning in one product and a Tuesday
 * evening in another are a day apart in the reader's decision and were adjacent
 * under the date order. The comparator is beside this function and is where that
 * ordering is pinned.
 */
export function buildSubstitutionPoolRows(
  requests: readonly OpenSubstitutionRequest[],
  locale: SupportedLocale,
): SubstitutionPoolRow[] {
  const rows = requests.map((request) => {
    const occurrence = occurrenceOnDate({
      sessionDate: request.session_date,
      slots: request.product.schedule_slots.map((slot) => ({
        weekday: slot.weekday,
        startTime: slot.start_time,
        durationMinutes: slot.duration_minutes,
      })),
      timezone: request.product.timezone,
    });

    return {
      requestId: request.request_id,
      groupId: request.group_id,
      groupName: request.group_name,
      sessionDate: request.session_date,
      startsAt: occurrence?.start ?? null,
      endsAt: occurrence?.end ?? null,
      timezone: request.product.timezone,
      productName:
        resolveTranslation(request.product.translations, locale)?.name ?? "",
      productType: request.product.product_type,
      topic: request.product.topic,
      spokenLanguageCode: request.product.spoken_language_code,
      isRemote: request.product.is_remote,
      siteName: request.product.site_name,
      role: request.role,
      feeCents: request.fee_cents,
      hasOffered: request.has_offered,
    } satisfies SubstitutionPoolRow;
  });

  return sortSubstitutionPoolRows(rows);
}
