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
 * what one line of it actually shows.
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
 * Shape the pool rows for one viewer, **in the order the read handed them
 * over** (date, then product).
 *
 * No sort of its own: the ordering is the database's, one row of SQL rather
 * than a comparator that could drift from it, and re-sorting here would be a
 * second answer to a settled question.
 */
export function buildSubstitutionPoolRows(
  requests: readonly OpenSubstitutionRequest[],
  locale: SupportedLocale,
): SubstitutionPoolRow[] {
  return requests.map((request) => {
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
}
