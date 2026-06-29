import {
  dateTimeInstant,
  nextOccurrenceInstant,
  viewerWeekdayIndex,
} from "@/lib/schedule-occurrence";
import { formatDate, formatDateOnly } from "@/lib/utils";
import type { ProductBrowseRow } from "@/types";

// Schedule formatting for the browse + purchased cards and the detail page's
// "When & where" row.
//
// Per CLAUDE.md "Date & Time Formatting", any value that carries a time of day
// renders in the VIEWER's timezone. Slots are stored as Postgres TIME wall-clock
// in the product's source zone (`product.timezone`, redesign §4.3); we convert
// each to an absolute instant (`@/lib/schedule-occurrence`) and re-derive the
// weekday + clock face in the viewer's zone. A pure calendar date with no time
// (a camp's start/end RANGE) stays UTC-pinned via `formatDateOnly` — converting
// a zoneless date is meaningless. So: schedule TIMES convert (weekday/date may
// shift, e.g. Helsinki Mon 23:30 → Tokyo Tue 06:30); the camp date range does
// not.
//
// Output carries `tzAbbrev` (viewer-local abbrev) + `tzAdjusted` (viewer zone
// differs from source) as structured data — the React consumer composes the
// localised "your time" note, since this module is pure and can't translate.

export type ProductScheduleSummary =
  | { kind: "tbd" }
  | {
      kind: "recurring"; // consumer_club / municipality_club
      tzAbbrev: string;
      tzAdjusted: boolean;
      groups: ScheduleTimeGroup[]; // always >= 1 (otherwise we return tbd)
    }
  | {
      kind: "ranged"; // camp
      tzAbbrev: string;
      tzAdjusted: boolean;
      startDate: string; // UTC-pinned date-only — does NOT shift with viewer
      endDate: string; // UTC-pinned date-only — does NOT shift with viewer
      groups: ScheduleTimeGroup[]; // 0+ — empty if camp has no slots yet
    }
  | {
      kind: "single"; // event
      tzAbbrev: string;
      tzAdjusted: boolean;
      date: string; // viewer-local when the event has a time (may shift); else UTC-pinned
      weekday: string; // viewer-local long weekday of `date`
      time: { start: string; end: string } | null; // null when no slot exists
    };

export interface ScheduleTimeGroup {
  /** Viewer-zone weekdays (0=Mon..6=Sun) sharing this start/end. Sorted ascending. */
  weekdays: number[];
  /**
   * Localised weekday label. Long form ("Monday") when the group has a single
   * weekday, short form ("Mon, Wed") when it has multiple.
   */
  weekdaysLabel: string;
  /** "HH:MM" in the VIEWER's zone. */
  startTime: string;
  /** start + duration_minutes, "HH:MM" in the VIEWER's zone (computed on the instant). */
  endTime: string;
}

export interface FormatScheduleArgs {
  product: Pick<
    ProductBrowseRow,
    "product_type" | "start_date" | "end_date" | "timezone" | "schedule_slots"
  >;
  locale: string;
  /** Viewer's IANA zone — from `useTimezone()` (client) / `getServerTimezone()` (server). */
  timeZone: string;
  /** Stable "now" (from `useNow()`) anchoring recurring next-occurrence conversion. */
  now: Date;
}

// Schema labels Monday as 0 (redesign §5.1: "0=Mon..6=Sun"). Seed a known
// Monday so adding `weekday` walks forward through the week, then ask Intl to
// render the day name in the user's locale.
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

// A 24h "HH:MM" clock face for an instant as it falls in `timeZone`. en-GB +
// hourCycle h23 gives a stable 00–23 "HH:MM" regardless of the UI locale,
// matching the schedule's existing 24h look.
function viewerClock(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hh}:${mm}`;
}

function viewerTzAbbrev(instant: Date, locale: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(instant);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

interface SlotInstant {
  instant: Date;
  durationMinutes: number;
}

// Group converted slots in VIEWER space. Two source slots that share a Helsinki
// time can land on different viewer weekdays/times (so they split), or two that
// differ at source can coincide for the viewer (so they collapse) — grouping
// after conversion handles both. The end time is computed by adding the
// duration to the INSTANT and re-formatting in the viewer zone; never string-add
// the viewer-local start, or a DST transition inside the session corrupts it.
function buildViewerGroups(
  entries: readonly SlotInstant[],
  locale: string,
  timeZone: string,
): { groups: ScheduleTimeGroup[]; sample: Date | null } {
  const buckets = new Map<string, { weekdays: Set<number>; start: string; end: string }>();
  for (const { instant, durationMinutes } of entries) {
    const start = viewerClock(instant, timeZone);
    const endInstant = new Date(instant.getTime() + durationMinutes * 60_000);
    const end = viewerClock(endInstant, timeZone);
    const weekday = viewerWeekdayIndex(instant, timeZone);
    const key = `${start}|${end}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.weekdays.add(weekday);
    else buckets.set(key, { weekdays: new Set([weekday]), start, end });
  }

  const groups: ScheduleTimeGroup[] = [];
  for (const { weekdays, start, end } of buckets.values()) {
    const sorted = [...weekdays].sort((a, b) => a - b);
    const form: "long" | "short" = sorted.length === 1 ? "long" : "short";
    groups.push({
      weekdays: sorted,
      weekdaysLabel: sorted.map((w) => formatWeekday(w, locale, form)).join(", "),
      startTime: start,
      endTime: end,
    });
  }
  groups.sort((a, b) => a.weekdays[0] - b.weekdays[0]);
  return { groups, sample: entries.length > 0 ? entries[0].instant : null };
}

// First calendar date on/after `startDate` whose weekday is `weekday` (0=Mon..
// 6=Sun). Anchors a camp slot's conversion to a concrete in-range date so the
// offset (DST) matches the actual camp, not "next occurrence from now".
function firstDateForWeekday(startDate: string, weekday: number): string {
  const d = new Date(`${startDate}T12:00:00Z`);
  const iso = d.getUTCDay(); // 0=Sun..6=Sat
  const cur = iso === 0 ? 6 : iso - 1; // → 0=Mon..6=Sun
  const daysAhead = (weekday - cur + 7) % 7;
  const target = new Date(d.getTime() + daysAhead * 86_400_000);
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, "0");
  const day = String(target.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Joins per-time-group entries onto one line ("Mon, Wed · 16:00–17:30,
// Fri · 18:00–19:30"). Shared by every card that renders a single-line summary.
export function joinScheduleGroups(
  groups: readonly ScheduleTimeGroup[],
): string {
  return groups
    .map((g) => `${g.weekdaysLabel} · ${g.startTime}–${g.endTime}`)
    .join(", ");
}

// The viewer-tz abbrev to append, or "" when the viewer is in the source zone
// (no adjustment → no decoration). The abbrev is already locale-formatted by
// Intl, so no translation is needed — we show the bare short zone, e.g.
// "(GMT+9)". Only time-bearing lines get it (the camp date RANGE is UTC-pinned
// and unadjusted, so it never does).
function tzAbbrevFor(schedule: ProductScheduleSummary): string {
  return schedule.kind !== "tbd" && schedule.tzAdjusted ? schedule.tzAbbrev : "";
}

function withTz(line: string, abbrev: string): string {
  return abbrev ? `${line} (${abbrev})` : line;
}

// 0-2 schedule lines for a card. The viewer-tz abbrev is appended to the line
// that carries TIMES (not the camp date range).
export function scheduleCardLines(schedule: ProductScheduleSummary): string[] {
  const abbrev = tzAbbrevFor(schedule);
  switch (schedule.kind) {
    case "tbd":
      return [];
    case "recurring":
      return [withTz(joinScheduleGroups(schedule.groups), abbrev)];
    case "ranged": {
      const dateLine = `${schedule.startDate} – ${schedule.endDate}`;
      if (schedule.groups.length === 0) return [dateLine];
      // Common single-bucket camp: drop the weekday list — the date range
      // already gives the calendar shape and "09:00–15:00" reads as "daily
      // hours". Multi-bucket camps keep weekday labels.
      const timeLine =
        schedule.groups.length === 1
          ? `${schedule.groups[0].startTime}–${schedule.groups[0].endTime}`
          : joinScheduleGroups(schedule.groups);
      return [dateLine, withTz(timeLine, abbrev)];
    }
    case "single": {
      const line = schedule.time
        ? withTz(
            `${schedule.date} · ${schedule.time.start}–${schedule.time.end}`,
            abbrev,
          )
        : schedule.date;
      return [line];
    }
  }
}

// Multi-line schedule for detail surfaces — the parent/gedu "When & where"
// card and the admin product details page. Breaks each time-group onto its own
// line; the viewer-tz abbrev decorates the first time-bearing line.
export function renderScheduleLinesForDetail(
  schedule: ProductScheduleSummary,
): string[] {
  const abbrev = tzAbbrevFor(schedule);
  switch (schedule.kind) {
    case "tbd":
      return ["—"];
    case "recurring":
      return schedule.groups.map((g, idx) => {
        const line = `${g.weekdaysLabel} · ${g.startTime}–${g.endTime}`;
        return idx === 0 ? withTz(line, abbrev) : line;
      });
    case "ranged": {
      const dateLine = `${schedule.startDate} – ${schedule.endDate}`;
      const groupLines = schedule.groups.map((g, idx) =>
        withTz(`${g.weekdaysLabel} · ${g.startTime}–${g.endTime}`, idx === 0 ? abbrev : ""),
      );
      return [dateLine, ...groupLines];
    }
    case "single": {
      const line = schedule.time
        ? withTz(
            `${schedule.date} · ${schedule.time.start}–${schedule.time.end}`,
            abbrev,
          )
        : schedule.date;
      return [line];
    }
  }
}

export function formatProductSchedule({
  product,
  locale,
  timeZone,
  now,
}: FormatScheduleArgs): ProductScheduleSummary {
  const slots = product.schedule_slots;
  const sourceTz = product.timezone;
  const tzAdjusted = timeZone !== sourceTz;

  switch (product.product_type) {
    case "consumer_club":
    case "municipality_club": {
      if (slots.length === 0) return { kind: "tbd" };
      // Recurring: anchor each slot to its next occurrence from `now` (no
      // concrete date exists for an open-ended weekly schedule).
      const entries: SlotInstant[] = slots.map((s) => ({
        instant: nextOccurrenceInstant(s.weekday, s.start_time, sourceTz, now),
        durationMinutes: s.duration_minutes,
      }));
      const { groups, sample } = buildViewerGroups(entries, locale, timeZone);
      return {
        kind: "recurring",
        tzAbbrev: viewerTzAbbrev(sample ?? now, locale, timeZone),
        tzAdjusted,
        groups,
      };
    }
    case "camp": {
      if (!product.start_date || !product.end_date) return { kind: "tbd" };
      // Camp: anchor each slot to its first in-range date so the offset (DST)
      // matches the actual camp, not "now". The date RANGE stays UTC-pinned.
      const start = product.start_date;
      const entries: SlotInstant[] = slots.map((s) => ({
        instant: dateTimeInstant(
          firstDateForWeekday(start, s.weekday),
          s.start_time,
          sourceTz,
        ),
        durationMinutes: s.duration_minutes,
      }));
      const { groups, sample } = buildViewerGroups(entries, locale, timeZone);
      return {
        kind: "ranged",
        tzAbbrev: viewerTzAbbrev(sample ?? now, locale, timeZone),
        tzAdjusted,
        startDate: formatDateOnly(start, locale),
        endDate: formatDateOnly(product.end_date, locale),
        groups,
      };
    }
    case "event": {
      if (!product.start_date) return { kind: "tbd" };
      if (slots.length === 0) {
        // No time of day → the date is zoneless; keep it UTC-pinned, no shift.
        return {
          kind: "single",
          tzAbbrev: viewerTzAbbrev(now, locale, timeZone),
          tzAdjusted,
          date: formatDateOnly(product.start_date, locale),
          weekday: formatDateOnly(product.start_date, locale, { weekday: "long" }),
          time: null,
        };
      }
      // Event with a time = an instant → render date/weekday/time in viewer
      // zone; the displayed date may shift across the boundary.
      const slot = slots[0];
      const instant = dateTimeInstant(product.start_date, slot.start_time, sourceTz);
      const endInstant = new Date(instant.getTime() + slot.duration_minutes * 60_000);
      return {
        kind: "single",
        tzAbbrev: viewerTzAbbrev(instant, locale, timeZone),
        tzAdjusted,
        date: formatDate(instant, locale, { dateStyle: "medium", timeZone }),
        weekday: formatDate(instant, locale, { weekday: "long", timeZone }),
        time: { start: viewerClock(instant, timeZone), end: viewerClock(endInstant, timeZone) },
      };
    }
  }
}
