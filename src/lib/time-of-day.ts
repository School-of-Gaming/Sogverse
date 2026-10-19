// A wall-clock time of day — no calendar date, no timezone. Postgres stores
// these as `time without time zone` and they travel as "HH:MM" / "HH:MM:SS"
// strings; in code we model them as minutes since midnight so comparisons and
// offsets are plain integer arithmetic.
//
// Deliberately NOT a JS Date. A Date is an *instant* anchored to a zone, so
// turning "16:00" into one means inventing a calendar day — and if that day
// lands on a DST transition the arithmetic is off by an hour. A time-of-day has
// neither a date nor a zone, so there's nothing to convert and nothing to get
// wrong. The zone is applied far downstream, when a slot is projected onto a
// real date for display (see CLAUDE.md "Date & Time Formatting").

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Parse "HH:MM" or Postgres "HH:MM:SS" into minutes since midnight. */
export function parseTimeOfDay(time: string): number {
  const [hours, minutes] = time.split(":");
  return Number(hours) * MINUTES_PER_HOUR + Number(minutes);
}

/**
 * Format minutes since midnight as "HH:MM", wrapping on a 24-hour clock so a
 * session running past midnight renders "00:30" rather than "24:30". (The
 * day-of-week becomes ambiguous in that rare case; callers anchor to the start
 * day.)
 */
export function formatTimeOfDay(totalMinutes: number): string {
  const wrapped =
    ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(wrapped / MINUTES_PER_HOUR))}:${pad2(
    wrapped % MINUTES_PER_HOUR,
  )}`;
}

/** Normalise a stored time to "HH:MM" for display (drops Postgres' seconds). */
export function clockTime(time: string): string {
  return formatTimeOfDay(parseTimeOfDay(time));
}

/** Add (or subtract, with a negative count) minutes, returning "HH:MM". */
export function addMinutes(time: string, minutes: number): string {
  return formatTimeOfDay(parseTimeOfDay(time) + minutes);
}

/** Minutes from `start` to `end` (end − start), same-day. */
export function minutesBetween(start: string, end: string): number {
  return parseTimeOfDay(end) - parseTimeOfDay(start);
}

/** Hour component as a zero-padded "00".."23" — matches an <option> value. */
export function hourOf(time: string): string {
  return pad2(Math.floor(parseTimeOfDay(time) / MINUTES_PER_HOUR));
}

/** Minute component as a zero-padded "00".."59". */
export function minuteOf(time: string): string {
  return pad2(parseTimeOfDay(time) % MINUTES_PER_HOUR);
}

/** Replace the hour, keeping the minute. */
export function withHour(time: string, hour: number): string {
  return formatTimeOfDay(
    hour * MINUTES_PER_HOUR + (parseTimeOfDay(time) % MINUTES_PER_HOUR),
  );
}

/** Replace the minute, keeping the hour. */
export function withMinute(time: string, minute: number): string {
  const minutes = parseTimeOfDay(time);
  return formatTimeOfDay(minutes - (minutes % MINUTES_PER_HOUR) + minute);
}
