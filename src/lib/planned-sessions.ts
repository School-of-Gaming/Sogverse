import { z } from "zod";

/**
 * The app's side of the database's session plan.
 *
 * A product's planned sessions — its term crossed with its weekly slots, less
 * the product's holiday breaks — are
 * expanded in exactly one place, the `planned_session_dates` function, and
 * `planned_group_sessions` adds which groups cancelled each date. This module
 * parses those rows and holds the two pieces of shaping every reader of them
 * repeats: cutting an open-ended plan down to the sessions a list shows, and
 * finding the next session that actually runs. Neither expands anything; a
 * date that is not in the plan cannot be produced here.
 */

/** An instant as PostgREST renders a timestamptz, back as a `Date`. */
const instant = z
  .string()
  .transform((value) => new Date(value))
  .refine((value) => !Number.isNaN(value.getTime()), "not a timestamp");

/**
 * One row of `planned_session_dates`, or of `planned_group_sessions` read for
 * one group with its cancellation folded into `cancelled`. A row without the
 * flag is a plan read with no cancellations in view, which is `false`.
 */
export const plannedSessionRow = z
  .object({
    /** Product-local `YYYY-MM-DD`: the session's identity with its group. */
    session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    starts_at: instant,
    ends_at: instant,
    cancelled: z.boolean().optional(),
  })
  .transform((row) => ({
    date: row.session_date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    cancelled: row.cancelled ?? false,
  }));

export type PlannedSession = z.output<typeof plannedSessionRow>;

export const plannedSessionRows = z.array(plannedSessionRow);

/**
 * How many sessions that have not yet closed an open-ended product's lists
 * show — the family's and the gedu's alike, so both see the same horizon. A
 * dated product shows its whole term instead.
 */
export const OPEN_ENDED_OCCURRENCE_CAP = 8;

/**
 * An open-ended plan cut to what a session list shows: **every session that has
 * started, plus the first `cap` that have not yet closed.**
 *
 * A session has closed `closeMarginMs` after it ends, so one in progress — or
 * just finished, inside the margin — counts toward the cap alongside the
 * upcoming ones, and is kept by both halves without appearing twice. A dated
 * product needs none of this: its plan already stops at its end date.
 *
 * `plan` is soonest first, as the database returns it, and so is the result.
 */
export function trimOpenEndedFuture<T extends PlannedSession>(
  plan: readonly T[],
  now: Date,
  cap: number,
  closeMarginMs: number,
): T[] {
  const nowMs = now.getTime();
  let open = 0;
  return plan.filter((session) => {
    const stillOpen = session.endsAt.getTime() + closeMarginMs > nowMs;
    const keptAsOpen = stillOpen && open < cap;
    if (keptAsOpen) open += 1;
    return keptAsOpen || session.startsAt.getTime() < nowMs;
  });
}

/**
 * The first session that has not closed and is not cancelled, and the
 * cancelled ones ahead of it.
 *
 * "Closed" is `closeMarginMs` after the end, as in `trimOpenEndedFuture`, so a
 * session in progress is still the next one. `next` is `null` when every open
 * session in `plan` is cancelled, and `cancelledAhead` is then all of them. The
 * plan holds one session per date, so each cancelled date appears once.
 */
export function nextRunning<T extends PlannedSession>(
  plan: readonly T[],
  now: Date,
  closeMarginMs: number,
): { next: T | null; cancelledAhead: T[] } {
  const nowMs = now.getTime();
  const cancelledAhead: T[] = [];
  for (const session of plan) {
    if (session.endsAt.getTime() + closeMarginMs <= nowMs) continue;
    if (!session.cancelled) return { next: session, cancelledAhead };
    cancelledAhead.push(session);
  }
  return { next: null, cancelledAhead };
}

/**
 * Where a cut plan stops: the start of the first session the cut left out, or
 * `null` when it kept them all. Anything planned from this instant on is beyond
 * the list's horizon — which is how a feed decides that a holiday break whose
 * withdrawn sessions all lie past it is not worth a line.
 */
export function cutStartsAt<T extends PlannedSession>(
  plan: readonly T[],
  kept: readonly T[],
): Date | null {
  const keptSessions = new Set(kept);
  return plan.find((session) => !keptSessions.has(session))?.startsAt ?? null;
}
