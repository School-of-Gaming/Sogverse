import { fromZonedTime } from "date-fns-tz";
import { parseTime } from "@/lib/utils";

/**
 * The instants one **named** session runs between — the inverse of the walk
 * every feed makes.
 *
 * Every other occurrence derivation in the app goes forwards: it is handed a
 * schedule and a clock and enumerates the dates the slots project. The substitution
 * surfaces start from the other end — a request, a substitution and a queue row all
 * carry a product-local `YYYY-MM-DD` and no instant, because the database emits
 * the date plus the product's slots and timezone and leaves the calendar maths
 * to the client, exactly as both session feeds already do. So the one thing
 * those surfaces need is this: given the day, when does it start and end.
 *
 * Pure, and the only zone it knows is the product's — what a reader is shown is
 * the viewer's, converted from the instants this returns.
 */

/** One recurring slot, in the shape every reader of a schedule carries it. */
export interface SessionDateSlot {
  /** 0 = Monday, the app's own convention. */
  weekday: number;
  /** Wall clock in the product's zone: `HH:MM` or `HH:MM:SS`. */
  startTime: string;
  durationMinutes: number;
}

/** When a session runs, as two absolute instants. */
export interface SessionDateOccurrence {
  start: Date;
  end: Date;
}

/**
 * The occurrence a product's schedule puts on `sessionDate`, or `null` when no
 * slot names that weekday.
 *
 * **`null` is a real answer, not a failure.** A stored request keys on (group,
 * date) like every session record, so an admin moving the schedule's weekday
 * afterwards orphans it — the row is history, and the date it names is a day
 * the schedule no longer projects. Every caller renders the date alone rather
 * than dropping the row, which is what the admin queue's "order by date, never
 * by a derived instant" rule asks of everything downstream of it.
 *
 * Two slots on one weekday (a morning and an afternoon camp block) resolve to
 * the **earliest**, which is the one a reader means by "that day's session".
 *
 * The weekday is read UTC-pinned off the bare date — a calendar date has no
 * zone to convert through — and the start is built as a wall clock in the
 * product's zone and converted once. The end is the start *instant* plus the
 * duration, never a string-added local time, so a DST transition inside the
 * session cannot corrupt it.
 */
export function occurrenceOnDate(args: {
  /** Product-local `YYYY-MM-DD`. */
  sessionDate: string;
  slots: readonly SessionDateSlot[];
  /** The product's own IANA zone — the one the slots are authored in. */
  timezone: string;
}): SessionDateOccurrence | null {
  const { sessionDate, slots, timezone } = args;

  const midnight = new Date(`${sessionDate}T00:00:00.000Z`);
  if (Number.isNaN(midnight.getTime())) return null;
  // `getUTCDay()` is 0 = Sunday; the app's slots are 0 = Monday.
  const weekday = (midnight.getUTCDay() + 6) % 7;

  const onDay = slots.filter((slot) => slot.weekday === weekday);
  if (onDay.length === 0) return null;

  const slot = onDay.reduce((earliest, candidate) =>
    minutesOf(candidate.startTime) < minutesOf(earliest.startTime)
      ? candidate
      : earliest,
  );

  const { hours, minutes } = parseTime(slot.startTime);
  const start = fromZonedTime(
    `${sessionDate}T${pad(hours)}:${pad(minutes)}:00`,
    timezone,
  );
  if (Number.isNaN(start.getTime())) return null;

  return { start, end: new Date(start.getTime() + slot.durationMinutes * 60_000) };
}

function minutesOf(time: string): number {
  const { hours, minutes } = parseTime(time);
  return hours * 60 + minutes;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
