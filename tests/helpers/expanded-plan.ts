import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * A product's plan as `planned_session_dates` answers it, built test-side so a
 * unit test can hand a composer the rows the database would: every date in
 * `[from, to]` inside the term on which a slot falls, one row per slot, soonest
 * first, instants resolved in the product's zone.
 *
 * The database's expansion is the real one and is tested in `tests/db/`; this
 * is a fixture builder, and a test that wants a plan the term does not explain
 * — a holiday — takes rows out of what this returns.
 */
export interface PlanSlot {
  /** `0` = Monday … `6` = Sunday. */
  weekday: number;
  /** `HH:MM`, or `HH:MM:SS` as a `time` column comes back. */
  startTime: string;
  durationMinutes: number;
}

export interface ExpandedPlanSession {
  date: string;
  startsAt: Date;
  endsAt: Date;
}

const DAY_MS = 86_400_000;

export function expandPlan({
  slots,
  startDate,
  endDate,
  timezone,
  from = startDate,
  to = endDate,
}: {
  slots: readonly PlanSlot[];
  startDate: string;
  endDate: string | null;
  timezone: string;
  from?: string;
  to?: string | null;
}): ExpandedPlanSession[] {
  if (to === null) throw new Error("an open-ended plan needs a `to`");
  const first = Date.parse(`${from > startDate ? from : startDate}T00:00:00Z`);
  const lastDate = endDate !== null && endDate < to ? endDate : to;
  const last = Date.parse(`${lastDate}T00:00:00Z`);

  const sessions: ExpandedPlanSession[] = [];
  for (let day = first; day <= last; day += DAY_MS) {
    const date = formatInTimeZone(new Date(day), "UTC", "yyyy-MM-dd");
    const weekday = (new Date(day).getUTCDay() + 6) % 7;
    const onTheDay = slots
      .filter((slot) => slot.weekday === weekday)
      .map((slot) => {
        const startsAt = fromZonedTime(`${date}T${slot.startTime.slice(0, 5)}:00`, timezone);
        return {
          date,
          startsAt,
          endsAt: new Date(startsAt.getTime() + slot.durationMinutes * 60_000),
        };
      })
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    sessions.push(...onTheDay);
  }
  return sessions;
}
