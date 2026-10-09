import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { PlannedSession } from "@/lib/planned-sessions";

/**
 * Planned sessions for a test fixture, laid out the way the database's plan
 * expansion lays them out: every date from `startDate` to the end of the span
 * whose weekday a slot names (0 = Monday), each slot's wall-clock start
 * resolved in `timezone`, the end the duration later on the instant, soonest
 * first, nothing cancelled.
 *
 * The span ends at `endDate` on a dated product. An open-ended one has no end,
 * so it runs `openEndedDays` past `now`'s product-local date — far enough for
 * the eight-session horizon of any weekly or daily schedule, which is what the
 * database's own horizon guarantees. A `null` start plans nothing, exactly as
 * the database answers a span with a missing bound.
 *
 * Test-side only: the app never expands a plan.
 */
export function planSessions(args: {
  timezone: string;
  slots: readonly {
    weekday: number;
    startTime: string;
    durationMinutes: number;
  }[];
  startDate: string | null;
  endDate: string | null;
  now: Date;
  openEndedDays?: number;
}): PlannedSession[] {
  const { timezone, slots, startDate, endDate, now, openEndedDays = 120 } =
    args;
  if (startDate === null || slots.length === 0) return [];

  const last =
    endDate ??
    addDays(formatInTimeZone(now, timezone, "yyyy-MM-dd"), openEndedDays);

  const plan: PlannedSession[] = [];
  for (let date = startDate; date <= last; date = addDays(date, 1)) {
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
        now: new Date(`${date}T00:00:00.000Z`),
      })
      : []
  ).at(0);
  return {
    starts_at: session?.startsAt.toISOString() ?? null,
    ends_at: session?.endsAt.toISOString() ?? null,
  };
}
