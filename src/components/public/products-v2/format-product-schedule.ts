import type { ProductV2BrowseRow } from "@/types";

// Schedule formatting for the browse + purchased cards and the detail
// page's "When & where" row.
//
// Returns a discriminated union plus per-product time groups, so a single
// pass over `schedule_slots_v2` can drive both the compact card view and
// the multi-line detail view. Slots that share a (start_time, duration)
// collapse into a single group — that handles the common "Mon/Wed/Fri at
// the same hour" camp shape, while products with varying daily times get
// one group per (start_time, duration) bucket.
//
// Per CLAUDE.md "Date & Time Formatting", we use Intl APIs for output and
// reach for date-fns-tz only for timezone-aware computation. Times are
// stored as Postgres TIME ("HH:MM:SS") in the product's local timezone
// (see redesign §4.3) — they don't need conversion to render the clock
// face. Just slice off the seconds and add `duration_minutes` for the
// end-time clock.

export type ProductScheduleSummary =
  | { kind: "tbd" }
  | {
      kind: "recurring"; // consumer_club / municipality_club
      tz: string;
      groups: ScheduleTimeGroup[]; // always >= 1 (otherwise we return tbd)
    }
  | {
      kind: "ranged"; // camp
      tz: string;
      startDate: string;
      endDate: string;
      groups: ScheduleTimeGroup[]; // 0+ — empty if camp has no slots yet
    }
  | {
      kind: "single"; // event
      tz: string;
      date: string;
      time: { start: string; end: string } | null; // null when no slot exists
    };

export interface ScheduleTimeGroup {
  /** Schema weekdays (0=Mon..6=Sun) that share this start/duration. Sorted ascending. */
  weekdays: number[];
  /**
   * Localised weekday label. Long form ("Monday") when the group has a
   * single weekday, short form ("Mon, Wed") when it has multiple — keeps
   * lines readable as the day count grows.
   */
  weekdaysLabel: string;
  /** "HH:MM" in product-local time (no timezone conversion). */
  startTime: string;
  /** start_time + duration_minutes, "HH:MM". Wraps past midnight via mod 24. */
  endTime: string;
}

export interface FormatScheduleArgs {
  product: Pick<
    ProductV2BrowseRow,
    "product_type" | "start_date" | "end_date" | "timezone" | "schedule_slots_v2"
  >;
  locale: string;
}

// Schema labels Monday as 0 (per redesign §5.1: "0=Mon..6=Sun"). Seed a
// known Monday so adding `weekday` directly walks forward through the
// week, then ask Intl to render the day name in the user's locale.
const WEEKDAY_SEED = new Date(Date.UTC(2024, 0, 1)); // a Monday

export function formatWeekday(
  weekday: number,
  locale: string,
  form: "long" | "short" = "long",
): string {
  const d = new Date(WEEKDAY_SEED);
  d.setUTCDate(WEEKDAY_SEED.getUTCDate() + weekday);
  return new Intl.DateTimeFormat(locale, { weekday: form }).format(d);
}

function formatClockTime(time: string): string {
  // Postgres TIME comes back as "HH:MM:SS"; strip seconds for display.
  return time.slice(0, 5);
}

function addMinutesToClock(time: string, minutes: number): string {
  const [hh, mm] = time.split(":").map(Number);
  const total = hh * 60 + mm + minutes;
  // Wrap on a 24h clock — duration that crosses midnight is rare but the
  // formatter shouldn't render "26:30". Day-of-week becomes ambiguous in
  // that case; the calendar grid still anchors to the start day.
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const eh = String(Math.floor(wrapped / 60)).padStart(2, "0");
  const em = String(wrapped % 60).padStart(2, "0");
  return `${eh}:${em}`;
}

function formatDateOnly(date: string, locale: string): string {
  // Date-only string. Anchor to UTC noon so locale rendering doesn't tip
  // it into the previous day for negative-offset zones.
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

export function formatTimezoneShort(tz: string, locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

type SlotInput = ProductV2BrowseRow["schedule_slots_v2"][number];

function buildTimeGroups(
  slots: readonly SlotInput[],
  locale: string,
): ScheduleTimeGroup[] {
  // Bucket by (start_time, duration_minutes). Map preserves insertion
  // order, so we sort slots by weekday first to get deterministic output.
  const sorted = [...slots].sort((a, b) => a.weekday - b.weekday);
  const buckets = new Map<string, SlotInput[]>();
  for (const slot of sorted) {
    const key = `${slot.start_time}|${slot.duration_minutes}`;
    const existing = buckets.get(key);
    if (existing) existing.push(slot);
    else buckets.set(key, [slot]);
  }

  const groups: ScheduleTimeGroup[] = [];
  for (const bucketSlots of buckets.values()) {
    const weekdays = bucketSlots.map((s) => s.weekday);
    const startTime = formatClockTime(bucketSlots[0].start_time);
    const endTime = addMinutesToClock(
      bucketSlots[0].start_time,
      bucketSlots[0].duration_minutes,
    );
    const form: "long" | "short" = weekdays.length === 1 ? "long" : "short";
    const weekdaysLabel = weekdays
      .map((w) => formatWeekday(w, locale, form))
      .join(", ");
    groups.push({ weekdays, weekdaysLabel, startTime, endTime });
  }

  // Stable: sort groups by their earliest weekday so multi-bucket output
  // reads chronologically across the week.
  groups.sort((a, b) => a.weekdays[0] - b.weekdays[0]);
  return groups;
}

// Joins per-time-group entries onto one line ("Mon, Wed · 16:00–17:30,
// Fri · 18:00–19:30"). Shared by every card that renders a single-line
// schedule summary (browse, purchased, gedu-assigned).
export function joinScheduleGroups(
  groups: readonly ScheduleTimeGroup[],
): string {
  return groups
    .map((g) => `${g.weekdaysLabel} · ${g.startTime}–${g.endTime}`)
    .join(", ");
}

// 0-2 schedule lines for a card. The split-vs-collapsed decision is up to
// the caller: the browse card prints each line on its own row; the
// gedu-assigned card joins with " · " so the rail entry stays one row.
//
// `withTimezone` decorates the lead line with the product's TZ abbrev. The
// detail body uses its own multi-line renderer that puts the TZ on its own
// chip, so this helper is card-only.
export function scheduleCardLines(
  schedule: ProductScheduleSummary,
  { withTimezone }: { withTimezone: boolean },
): string[] {
  const tz = (line: string, zone: string): string =>
    withTimezone && zone ? `${line} (${zone})` : line;

  switch (schedule.kind) {
    case "tbd":
      return [];
    case "recurring":
      return [tz(joinScheduleGroups(schedule.groups), schedule.tz)];
    case "ranged": {
      const dateLine = tz(
        `${schedule.startDate} – ${schedule.endDate}`,
        schedule.tz,
      );
      if (schedule.groups.length === 0) return [dateLine];
      // Common case (one bucket across all camp days): drop the weekday
      // list — the date range already gives the calendar shape and
      // "09:00–15:00" alone reads as "daily hours". Multi-bucket camps
      // keep weekday labels so the info isn't lost.
      const timeLine =
        schedule.groups.length === 1
          ? `${schedule.groups[0].startTime}–${schedule.groups[0].endTime}`
          : joinScheduleGroups(schedule.groups);
      return [dateLine, timeLine];
    }
    case "single": {
      const timeSuffix = schedule.time
        ? ` · ${schedule.time.start}–${schedule.time.end}`
        : "";
      return [tz(`${schedule.date}${timeSuffix}`, schedule.tz)];
    }
  }
}

export function formatProductSchedule({
  product,
  locale,
}: FormatScheduleArgs): ProductScheduleSummary {
  const tz = formatTimezoneShort(product.timezone, locale);
  const slots = product.schedule_slots_v2;

  switch (product.product_type) {
    case "consumer_club":
    case "municipality_club": {
      if (slots.length === 0) return { kind: "tbd" };
      return {
        kind: "recurring",
        tz,
        groups: buildTimeGroups(slots, locale),
      };
    }
    case "camp": {
      if (!product.start_date || !product.end_date) return { kind: "tbd" };
      return {
        kind: "ranged",
        tz,
        startDate: formatDateOnly(product.start_date, locale),
        endDate: formatDateOnly(product.end_date, locale),
        groups: buildTimeGroups(slots, locale),
      };
    }
    case "event": {
      if (!product.start_date) return { kind: "tbd" };
      const time =
        slots.length > 0
          ? {
              start: formatClockTime(slots[0].start_time),
              end: addMinutesToClock(
                slots[0].start_time,
                slots[0].duration_minutes,
              ),
            }
          : null;
      return {
        kind: "single",
        tz,
        date: formatDateOnly(product.start_date, locale),
        time,
      };
    }
  }
}
