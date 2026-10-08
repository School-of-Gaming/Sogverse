import { fromZonedTime } from "date-fns-tz";
import type { SupportedLocale } from "@/lib/constants/locales";
import {
  buildSessionFacts,
  sessionFactsProduct,
  type SessionFacts,
} from "@/lib/substitution-session-facts";
import type { OpenSubstitutionRequest } from "@/services/session-substitution";
import type { GeduAssignmentRole, SubstitutionOfferResponse } from "@/types";

/**
 * The pool a certified gedu picks a substitution out of — the wire rows turned into
 * what one card of it actually shows.
 *
 * **The session itself is described by the shared session facts**, as on every
 * other substitution surface — the date and slots becoming instants included.
 * What is the pool's own is the frame around it: the role, its fee, the
 * caller's own answer, and the order.
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
  /**
   * The session — when, where, what and in which language. An orphaned
   * request (a weekday the schedule no longer projects) has no instants, and
   * the queue still carries it because it orders by date and never by a
   * derived instant.
   */
  session: SessionFacts;
  /** The role being substituted — the absent gedu's, never the volunteer's. */
  role: GeduAssignmentRole;
  /**
   * What this role pays per session, or `null` where the product has not set
   * one. A blank fee is a blank field rather than a volunteer session, and
   * nothing flags it — which is the existing treatment of a missing assistant
   * fee.
   */
  feeCents: number | null;
  /**
   * The caller's own answer — `offer`, `decline`, or `null` before they have
   * given one. The card's three resting states; a declined request stays in
   * the pool so the gedu can still offer.
   */
  response: SubstitutionOfferResponse | null;
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
  session: Pick<SessionFacts, "startsAt">,
  now: Date,
): boolean {
  if (session.startsAt === null) return false;
  return (
    session.startsAt.getTime() - now.getTime() < SUBSTITUTION_URGENT_WITHIN_MS
  );
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
function poolSortInstant({ session }: SubstitutionPoolRow): number {
  if (session.startsAt !== null) return session.startsAt.getTime();
  return fromZonedTime(
    `${session.sessionDate}T23:59:59.999`,
    session.timezone,
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
  const rows = requests.map(
    (request): SubstitutionPoolRow => ({
      requestId: request.request_id,
      groupId: request.group_id,
      groupName: request.group_name,
      session: buildSessionFacts({
        product: sessionFactsProduct(request.product),
        sessionDate: request.session_date,
        locale,
      }),
      role: request.role,
      feeCents: request.fee_cents,
      response: request.my_response,
    }),
  );

  return sortSubstitutionPoolRows(rows);
}
