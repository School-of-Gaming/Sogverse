import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

/**
 * The clock a preview fixture is built against: turning "a session running right
 * now", "one a few days out" and "the day the run started" into the schedule
 * slots and calendar dates a product row actually carries.
 *
 * Every scene derives its page from a `now` the caller supplies, so a fixture
 * shows a plausible week around today rather than a hardcoded date that quietly
 * rots into the past. That derivation is the same arithmetic on every surface —
 * a gedu's assignment and a family's enrollment are two views of one product
 * row — so it lives here once. Two byte-identical copies of it were the state
 * this module replaced, including their DST reasoning, which is exactly the kind
 * of comment that gets fixed in one copy and not the other.
 *
 * **The zone is an argument, never a default.** A schedule slot is a weekday
 * plus a clock face in the *product's* zone, and the product's start and end
 * dates are calendar dates in it too; a helper that guessed would put a session
 * on the wrong day for anyone reading either side of midnight.
 */

/** One recurring slot, as every product row and fixture spec models it. */
export interface FixtureSlot {
  /** 0 = Monday, matching the `schedule_slots` convention. */
  weekday: number;
  /** `HH:MM` in the product's own zone. */
  startTime: string;
  durationMinutes: number;
}

/**
 * A weekly slot whose current occurrence started a few minutes ago, so whatever
 * is built on it is mid-session the moment the scene is opened.
 *
 * The open Join is the one state on these surfaces that cannot be seen on
 * demand — it is true for a couple of hours a week — so the fixture that owns a
 * room is always live when somebody looks. Its cadence line then reads as
 * whatever weekday you happen to open the page on, which is the honest
 * consequence and costs less than a Join button nobody can ever see lit. It is
 * also why **no fixture product is named after a weekday**: "Minecraft Monday
 * Club" saying "Saturday · 17:00" is the fixture contradicting itself on screen.
 *
 * The wall clock is read **in the product's own zone** and floored to a quarter
 * hour: flooring only ever moves the start earlier, so the session stays in
 * progress, and it keeps the cadence reading like a real schedule
 * ("16:30–18:00") rather than an arbitrary minute.
 */
export function liveNowSlot(
  now: Date,
  durationMinutes: number,
  timeZone: string,
): FixtureSlot {
  const started = toZonedTime(new Date(now.getTime() - 25 * 60_000), timeZone);
  started.setMinutes(Math.floor(started.getMinutes() / 15) * 15, 0, 0);
  return {
    // `getDay()` is 0 = Sunday; schedule slots are 0 = Monday.
    weekday: (started.getDay() + 6) % 7,
    startTime: `${pad2(started.getHours())}:${pad2(started.getMinutes())}`,
    durationMinutes,
  };
}

/**
 * A weekly slot a few days out, at a fixed clock face — the ordinary case, where
 * the next session is a date to read rather than a room to walk into.
 *
 * Deriving the weekday from `now` rather than pinning it is what keeps the
 * locked Join deterministic: a pinned Monday would be mid-session on a Monday
 * evening, so the card meant to show the *closed* state would occasionally show
 * the open one instead. The weekday is resolved in the product's zone, for the
 * same reason the live slot's is.
 */
export function futureSlot(
  now: Date,
  daysAhead: number,
  startTime: string,
  durationMinutes: number,
  timeZone: string,
): FixtureSlot {
  const target = toZonedTime(now, timeZone);
  target.setDate(target.getDate() + daysAhead);
  return {
    weekday: (target.getDay() + 6) % 7,
    startTime,
    durationMinutes,
  };
}

/**
 * A bare `YYYY-MM-DD` offset from today, **as today falls in the product's own
 * zone**.
 *
 * A product's start and end dates are zoneless calendar dates read back as
 * boundaries on a schedule authored in the product's timezone, so "today" here
 * has to mean today *there*. Stepping and formatting in UTC instead puts the
 * whole run a day early for every evening between about 21:00 UTC and Helsinki
 * midnight — which is exactly when a fixture's live session would find its own
 * end date already behind it and quietly stop being live.
 */
export function calendarDate(
  now: Date,
  dayOffset: number,
  timeZone: string,
): string {
  const zoned = toZonedTime(now, timeZone);
  zoned.setDate(zoned.getDate() + dayOffset);
  return formatInTimeZone(
    fromZonedTime(zoned, timeZone),
    timeZone,
    "yyyy-MM-dd",
  );
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
