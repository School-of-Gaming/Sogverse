import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { PlannedSession } from "@/lib/planned-sessions";

/**
 * A product's plan as `planned_session_dates` answers it, built test-side so a
 * unit test can hand a reader the rows the database would: every date of the
 * span inside the term whose weekday a slot names (0 = Monday), one row per
 * slot, each slot's wall-clock start resolved in `timezone` on its own date,
 * the end the duration later on the instant, soonest first, nothing cancelled.
 *
 * The span is the term, narrowed by `from` and `to` where given — the window a
 * read asks for. An open-ended term with no `to` runs `openEndedDays` past
 * `now`'s product-local date — far enough for the eight-session horizon of any
 * weekly or daily schedule, which is what the database's own horizon
 * guarantees. A `null` start plans nothing, exactly as the database answers a
 * span with a missing bound.
 *
 * The database's expansion is the real one and is tested in `tests/db/`; this
 * is a fixture builder, and a test that wants a plan the term does not explain
 * — a holiday — takes rows out of what this returns.
 */
export function planSessions(args: {
  timezone: string;
  slots: readonly {
    weekday: number;
    /** `HH:MM`, or `HH:MM:SS` as a `time` column comes back. */
    startTime: string;
    durationMinutes: number;
  }[];
  startDate: string | null;
  endDate: string | null;
  from?: string;
  to?: string;
  now?: Date;
  openEndedDays?: number;
}): PlannedSession[] {
  const { timezone, slots, startDate, endDate, from, to, now } = args;
  if (startDate === null || slots.length === 0) return [];

  const first = from !== undefined && from > startDate ? from : startDate;
  let last = to ?? endDate;
  if (last === null) {
    if (now === undefined) {
      throw new Error("an open-ended plan needs a `to` or a `now`");
    }
    last = addDays(
      formatInTimeZone(now, timezone, "yyyy-MM-dd"),
      args.openEndedDays ?? 120,
    );
  }
  if (endDate !== null && endDate < last) last = endDate;

  const plan: PlannedSession[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    const weekday = (new Date(`${date}T00:00:00.000Z`).getUTCDay() + 6) % 7;
    const sessions = slots
      .filter((slot) => slot.weekday === weekday)
      .map((slot) => {
        const startsAt = fromZonedTime(
          `${date}T${slot.startTime.slice(0, 5)}:00.000`,
          timezone,
        );
        return {
          date,
          startsAt,
          endsAt: new Date(startsAt.getTime() + slot.durationMinutes * 60_000),
          cancelled: false,
        };
      })
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    plan.push(...sessions);
  }
  return plan;
}

/**
 * {@link planSessions} as `planned_session_dates` puts it on the wire: one
 * `{session_date, starts_at, ends_at}` row per session.
 */
export function planRows(plan: readonly PlannedSession[]): {
  session_date: string;
  starts_at: string;
  ends_at: string;
}[] {
  return plan.map((session) => ({
    session_date: session.date,
    starts_at: session.startsAt.toISOString(),
    ends_at: session.endsAt.toISOString(),
  }));
}

/** A bare `YYYY-MM-DD` stepped by whole days, UTC-pinned so DST cannot touch it. */
function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  const month = String(next.getUTCMonth() + 1).padStart(2, "0");
  const day = String(next.getUTCDate()).padStart(2, "0");
  return `${next.getUTCFullYear()}-${month}-${day}`;
}

/**
 * The instants a substitution read carries for `date` on a fixture product in
 * its wire shape: the plan's earliest session on that date, or both `null` on a
 * date no slot names — the orphan a moved schedule leaves. A dated fixture's
 * term bounds it, as the database's plan does.
 */
export function wireSessionWindow(
  product: {
    timezone: string;
    start_date?: string | null;
    end_date?: string | null;
    schedule_slots: readonly {
      weekday: number;
      start_time: string;
      duration_minutes: number;
    }[];
  },
  date: string,
): { starts_at: string | null; ends_at: string | null } {
  const inTerm =
    (product.start_date == null || product.start_date <= date) &&
    (product.end_date == null || date <= product.end_date);
  const session = (
    inTerm
      ? planSessions({
        timezone: product.timezone,
        slots: product.schedule_slots.map((slot) => ({
          weekday: slot.weekday,
          startTime: slot.start_time,
          durationMinutes: slot.duration_minutes,
        })),
        startDate: date,
        endDate: date,
      })
      : []
  ).at(0);
  return {
    starts_at: session?.startsAt.toISOString() ?? null,
    ends_at: session?.endsAt.toISOString() ?? null,
  };
}
