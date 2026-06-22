import { fromZonedTime, toZonedTime } from "date-fns-tz";

// Conversion primitives that turn a source-timezone wall-clock schedule into
// an absolute UTC instant. Keeping the math here (zone-agnostic, returning a
// plain `Date`) lets every caller make its own viewer-timezone formatting
// decision — see `format-product-schedule.ts` for the viewer-local renderer
// and `formatScheduleLocal` in `utils.ts` for the legacy single-slot helper.
//
// This module imports ONLY date-fns-tz so it stays a leaf — `utils.ts` may
// depend on it without a cycle. The trivial "HH:MM[:SS]" split is inlined
// rather than importing `parseTime` from `utils.ts`, which would create one.
//
// Weekday convention: schema stores 0=Mon..6=Sun (per redesign §5.1); JS
// `getUTCDay()` is 0=Sun..6=Sat, so the two helpers below convert between them.

function splitTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(":").map(Number);
  return { hours, minutes };
}

function buildInstant(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  sourceTz: string,
): Date {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const hh = String(hours).padStart(2, "0");
  const min = String(minutes).padStart(2, "0");
  // fromZonedTime applies the offset in effect on THAT calendar date in the
  // source zone, so the result is DST-correct (the offset can differ between,
  // say, a January and a July occurrence of the same weekly slot).
  return fromZonedTime(`${year}-${mm}-${dd}T${hh}:${min}:00`, sourceTz);
}

/**
 * UTC instant of the next occurrence (strictly after `now`) of a recurring
 * `(weekday + "HH:MM" wall-clock)` slot interpreted in `sourceTz`.
 *
 * Resolves the calendar date of the next matching weekday in the source zone,
 * pins the wall-clock time on that date, and converts to an absolute instant.
 * A concrete date is required because the source→UTC offset is date-dependent
 * (DST), so a recurring slot can't be converted without anchoring to one.
 *
 * @param dayOfWeek 0=Mon..6=Sun (schema convention)
 * @param startTime "HH:MM" or Postgres "HH:MM:SS"
 */
export function nextOccurrenceInstant(
  dayOfWeek: number,
  startTime: string,
  sourceTz: string,
  now: Date,
): Date {
  const zonedNow = toZonedTime(now, sourceTz);
  // toZonedTime returns a Date whose UTC fields represent wall-clock in the
  // source zone, so getUTCDay() gives the current weekday there.
  const todayIso = zonedNow.getUTCDay(); // 0=Sun..6=Sat
  const targetIso = dayOfWeek === 6 ? 0 : dayOfWeek + 1; // Mon=0..Sun=6 → Sun=0..Sat=6
  let daysAhead = (targetIso - todayIso + 7) % 7;
  if (daysAhead === 0) daysAhead = 7; // strictly the NEXT occurrence

  const refDate = new Date(zonedNow.getTime() + daysAhead * 86_400_000);
  const { hours, minutes } = splitTime(startTime);
  return buildInstant(
    refDate.getUTCFullYear(),
    refDate.getUTCMonth() + 1,
    refDate.getUTCDate(),
    hours,
    minutes,
    sourceTz,
  );
}

/**
 * UTC instant of a fixed `(calendar date + "HH:MM" wall-clock time)` in
 * `sourceTz`. For camp/event sessions whose date is known — no "next" search.
 *
 * @param date "YYYY-MM-DD"
 * @param startTime "HH:MM" or Postgres "HH:MM:SS"
 */
export function dateTimeInstant(
  date: string,
  startTime: string,
  sourceTz: string,
): Date {
  const [year, month, day] = date.split("-").map(Number);
  const { hours, minutes } = splitTime(startTime);
  return buildInstant(year, month, day, hours, minutes, sourceTz);
}

/**
 * Weekday index (0=Mon..6=Sun) of an instant as it falls in `timeZone`.
 * The inverse mapping of `nextOccurrenceInstant`'s input convention, so a
 * round-trip through the viewer zone yields a comparable weekday.
 */
export function viewerWeekdayIndex(instant: Date, timeZone: string): number {
  const zoned = toZonedTime(instant, timeZone);
  const iso = zoned.getUTCDay(); // 0=Sun..6=Sat
  return iso === 0 ? 6 : iso - 1; // Sun=0..Sat=6 → Mon=0..Sun=6
}
